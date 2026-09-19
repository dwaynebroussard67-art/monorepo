import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, nextId, type VisitorEvent } from "../../lib/store.js";
import { computeSocialProof, defaultRules } from "../../lib/social-proof.js";

const createStoreSchema = z.object({ name: z.string().min(1), domain: z.string().optional() });
const createProductSchema = z.object({
  title: z.string().min(1),
  priceCents: z.number().int().positive(),
  inventoryQty: z.number().int().nonnegative().default(0)
});
const eventBatchSchema = z.object({
  events: z.array(z.object({
    productId: z.string().optional(),
    type: z.enum(["view", "add_to_cart", "purchase"]),
    anonId: z.string().min(1),
    at: z.number().int().positive().optional(),
    botScore: z.number().min(0).max(1).optional()
  })).min(1).max(1000)
});

export async function storeRoutes(app: FastifyInstance) {
  app.get("/stores", async () => ({ ok: true as const, data: [...db.stores.values()] }));

  app.post("/stores", async (req, reply) => {
    const parsed = createStoreSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const id = nextId("store");
    const store = { id, ...parsed.data };
    db.stores.set(id, store);
    db.proofRules.set(id, defaultRules(id));
    return reply.code(201).send({ ok: true, data: store });
  });

  app.get("/stores/:storeId/products", async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    if (!db.stores.has(storeId)) return reply.code(404).send({ ok: false, error: "store_not_found" });
    const products = [...db.products.values()].filter((p) => p.storeId === storeId);
    return { ok: true, data: products };
  });

  app.post("/stores/:storeId/products", async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    if (!db.stores.has(storeId)) return reply.code(404).send({ ok: false, error: "store_not_found" });
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const product = { id: nextId("prod"), storeId, status: "active" as const, ...parsed.data };
    db.products.set(product.id, product);
    return reply.code(201).send({ ok: true, data: product });
  });

  /** Signed-SDK event ingestion (scaffold: botScore supplied directly for determinism). */
  app.post("/stores/:storeId/events", async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    if (!db.stores.has(storeId)) return reply.code(404).send({ ok: false, error: "store_not_found" });
    const parsed = eventBatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const now = Date.now();
    const accepted: VisitorEvent[] = parsed.data.events.map((e) => ({
      id: nextId("evt"), storeId, productId: e.productId, type: e.type,
      anonId: e.anonId, at: e.at ?? now, botScore: e.botScore
    }));
    db.events.push(...accepted);
    return reply.code(202).send({ ok: true, data: { accepted: accepted.length } });
  });

  /** Moat read-path: confidence-scored proof payload for storefront widgets / stream overlays. */
  app.get("/stores/:storeId/social-proof", async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    if (!db.stores.has(storeId)) return reply.code(404).send({ ok: false, error: "store_not_found" });
    const rules = db.proofRules.get(storeId) ?? [];
    const productIds = [...db.products.values()].filter((p) => p.storeId === storeId).map((p) => p.id);
    const events = db.events.filter((e) => e.storeId === storeId);
    return { ok: true, data: computeSocialProof(storeId, events, rules, productIds) };
  });
}
