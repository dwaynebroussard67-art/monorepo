import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, nextId, type BuyNowToken } from "../../lib/store.js";
import { redeemTokenState } from "../../lib/social-proof.js";

const BUY_NOW_TTL_MS = 15 * 60_000;

const createStreamSchema = z.object({ storeId: z.string().min(1), hostId: z.string().min(1) });
const pinSchema = z.object({ productId: z.string().min(1) });
const buyNowSchema = z.object({ productId: z.string().min(1), viewerRef: z.string().min(1) });

function viewerCount(streamStoreId: string, startedAt: number): number {
  const fiveMinAgo = Date.now() - 5 * 60_000;
  const since = Math.max(fiveMinAgo, startedAt);
  return new Set(
    db.events.filter((e) => e.storeId === streamStoreId && e.type === "view" && e.at >= since).map((e) => e.anonId)
  ).size;
}

export async function streamRoutes(app: FastifyInstance) {
  app.post("/streams", async (req, reply) => {
    const parsed = createStreamSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    if (!db.stores.has(parsed.data.storeId)) return reply.code(404).send({ ok: false, error: "store_not_found" });
    const stream = { id: nextId("stream"), status: "live" as const, startedAt: Date.now(), ...parsed.data };
    db.streams.set(stream.id, stream);
    return reply.code(201).send({ ok: true, data: stream });
  });

  app.get("/streams/:streamId", async (req, reply) => {
    const { streamId } = req.params as { streamId: string };
    const stream = db.streams.get(streamId);
    if (!stream) return reply.code(404).send({ ok: false, error: "stream_not_found" });
    return { ok: true, data: { ...stream, viewers: viewerCount(stream.storeId, stream.startedAt) } };
  });

  /** Moat: host pins a product; viewers would receive a synced product card over the realtime gateway. */
  app.post("/streams/:streamId/pin", async (req, reply) => {
    const { streamId } = req.params as { streamId: string };
    const stream = db.streams.get(streamId);
    if (!stream) return reply.code(404).send({ ok: false, error: "stream_not_found" });
    if (stream.status !== "live") return reply.code(409).send({ ok: false, error: "stream_not_live" });
    const parsed = pinSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const product = db.products.get(parsed.data.productId);
    if (!product || product.storeId !== stream.storeId) return reply.code(404).send({ ok: false, error: "product_not_found" });
    stream.pinnedProductId = product.id;
    return { ok: true, data: { streamId: stream.id, pinnedProductId: product.id, realtimeEvent: "stream.product.pinned" } };
  });

  /** Moat: one-time, stream-bound buy-now token for embedded express checkout. */
  app.post("/streams/:streamId/buy-now", async (req, reply) => {
    const { streamId } = req.params as { streamId: string };
    const stream = db.streams.get(streamId);
    if (!stream) return reply.code(404).send({ ok: false, error: "stream_not_found" });
    if (stream.status !== "live") return reply.code(409).send({ ok: false, error: "stream_not_live" });
    const parsed = buyNowSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const product = db.products.get(parsed.data.productId);
    if (!product || product.storeId !== stream.storeId) return reply.code(404).send({ ok: false, error: "product_not_found" });
    const token: BuyNowToken = {
      id: nextId("bnt"), streamId: stream.id, productId: product.id,
      viewerRef: parsed.data.viewerRef, expiresAt: Date.now() + BUY_NOW_TTL_MS
    };
    db.buyNowTokens.set(token.id, token);
    return reply.code(201).send({ ok: true, data: token });
  });

  app.post("/streams/buy-now/:tokenId/redeem", async (req, reply) => {
    const { tokenId } = req.params as { tokenId: string };
    const token = db.buyNowTokens.get(tokenId);
    if (!token) return reply.code(404).send({ ok: false, error: "token_not_found" });
    const state = redeemTokenState(token);
    if (!state.ok) return reply.code(state.reason === "used" ? 409 : 410).send({ ok: false, error: `token_${state.reason}` });
    const product = db.products.get(token.productId)!;
    if (product.inventoryQty < 1) return reply.code(409).send({ ok: false, error: "insufficient_inventory" });
    token.usedAt = Date.now();
    product.inventoryQty -= 1;
    const order = {
      id: nextId("order"), storeId: product.storeId, totalCents: product.priceCents,
      paymentStatus: "pending" as const, fulfillmentStatus: "unfulfilled" as const,
      createdAt: Date.now(), source: { streamId: token.streamId, tokenId: token.id }
    };
    db.orders.set(order.id, order);
    db.events.push({ id: nextId("evt"), storeId: product.storeId, productId: product.id, type: "purchase", anonId: token.viewerRef, at: Date.now() });
    return reply.code(201).send({ ok: true, data: order });
  });
}
