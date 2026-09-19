import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, nextId, type Cart, type Order } from "../../lib/store.js";

const createCartSchema = z.object({ storeId: z.string().min(1), customerRef: z.string().min(1) });
const addItemSchema = z.object({ productId: z.string().min(1), qty: z.number().int().positive().max(99) });

/** Removes the item qty from inventory or fails. Server-side prices only — client totals are never trusted. */
function createOrderFromCart(cart: Cart): { ok: true; order: Order } | { ok: false; error: string; details?: unknown } {
  const lines = cart.items.map((item) => {
    const product = db.products.get(item.productId)!;
    return { item, product, lineTotal: product.priceCents * item.qty };
  });
  for (const { item, product } of lines) {
    if (item.qty > product.inventoryQty) {
      return { ok: false, error: "insufficient_inventory", details: { productId: product.id, available: product.inventoryQty, requested: item.qty } };
    }
  }
  for (const { item, product } of lines) product.inventoryQty -= item.qty;
  const order: Order = {
    id: nextId("order"), storeId: cart.storeId, cartId: cart.id,
    totalCents: lines.reduce((sum, l) => sum + l.lineTotal, 0),
    paymentStatus: "pending", fulfillmentStatus: "unfulfilled", createdAt: Date.now()
  };
  db.orders.set(order.id, order);
  cart.status = "checked_out";
  // Checkout feeds the social-proof loop with purchase events.
  for (const { item } of lines) {
    for (let i = 0; i < item.qty; i++) {
      db.events.push({ id: nextId("evt"), storeId: cart.storeId, productId: item.productId, type: "purchase", anonId: cart.customerRef, at: Date.now() });
    }
  }
  return { ok: true, order };
}

export async function cartRoutes(app: FastifyInstance) {
  app.post("/carts", async (req, reply) => {
    const parsed = createCartSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    if (!db.stores.has(parsed.data.storeId)) return reply.code(404).send({ ok: false, error: "store_not_found" });
    const cart: Cart = { id: nextId("cart"), status: "open", items: [], ...parsed.data };
    db.carts.set(cart.id, cart);
    return reply.code(201).send({ ok: true, data: cart });
  });

  app.post("/carts/:cartId/items", async (req, reply) => {
    const { cartId } = req.params as { cartId: string };
    const cart = db.carts.get(cartId);
    if (!cart) return reply.code(404).send({ ok: false, error: "cart_not_found" });
    if (cart.status !== "open") return reply.code(409).send({ ok: false, error: "cart_not_open" });
    const parsed = addItemSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const product = db.products.get(parsed.data.productId);
    if (!product || product.storeId !== cart.storeId) return reply.code(404).send({ ok: false, error: "product_not_found" });
    const existing = cart.items.find((i) => i.productId === product.id);
    if (existing) existing.qty += parsed.data.qty;
    else cart.items.push({ productId: product.id, qty: parsed.data.qty, unitPriceCents: product.priceCents });
    return { ok: true, data: cart };
  });

  app.post("/carts/:cartId/checkout", async (req, reply) => {
    const { cartId } = req.params as { cartId: string };
    const cart = db.carts.get(cartId);
    if (!cart) return reply.code(404).send({ ok: false, error: "cart_not_found" });
    if (cart.status !== "open") return reply.code(409).send({ ok: false, error: "cart_not_open" });
    if (cart.items.length === 0) return reply.code(400).send({ ok: false, error: "cart_empty" });
    const result = createOrderFromCart(cart);
    if (!result.ok) return reply.code(409).send({ ok: false, error: result.error, details: result.details });
    return reply.code(201).send({ ok: true, data: result.order });
  });
}
