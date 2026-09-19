/** In-memory data store. Production target: Prisma repositories (see prisma/schema.prisma). */
import { defaultRules, type SocialProofRule } from "./social-proof.js";

export type ProductStatus = "active" | "draft";
export type EventType = "view" | "add_to_cart" | "purchase";

export interface Store { id: string; name: string; domain?: string }
export interface Product {
  id: string; storeId: string; title: string;
  priceCents: number; inventoryQty: number; status: ProductStatus;
}
export interface CartItem { productId: string; qty: number; unitPriceCents: number }
export interface Cart {
  id: string; storeId: string; customerRef: string;
  status: "open" | "checked_out" | "abandoned"; items: CartItem[];
}
export interface Order {
  id: string; storeId: string; cartId?: string; totalCents: number;
  paymentStatus: "pending" | "paid" | "failed";
  fulfillmentStatus: "unfulfilled" | "fulfilled"; createdAt: number;
}
export interface VisitorEvent {
  id: string; storeId: string; productId?: string; type: EventType;
  anonId: string; at: number; botScore?: number;
}
export interface LiveStream {
  id: string; storeId: string; hostId: string;
  status: "live" | "ended"; pinnedProductId?: string; startedAt: number;
}
export interface BuyNowToken {
  id: string; streamId: string; productId: string; viewerRef: string;
  expiresAt: number; usedAt?: number;
}

export const db = {
  stores: new Map<string, Store>(),
  products: new Map<string, Product>(),
  carts: new Map<string, Cart>(),
  orders: new Map<string, Order>(),
  events: [] as VisitorEvent[],
  streams: new Map<string, LiveStream>(),
  buyNowTokens: new Map<string, BuyNowToken>(),
  proofRules: new Map<string, SocialProofRule[]>()
};

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
}

let seeded = false;
export function seed() {
  if (seeded) return;
  seeded = true;

  const store: Store = { id: "store_aurora", name: "Aurora Outfitters", domain: "aurora.example.com" };
  db.stores.set(store.id, store);
  db.proofRules.set(store.id, defaultRules(store.id));

  const products: Product[] = [
    { id: "prod_trail_jacket", storeId: store.id, title: "Trailhead Shell Jacket", priceCents: 14900, inventoryQty: 40, status: "active" },
    { id: "prod_day_pack", storeId: store.id, title: "Summit Day Pack 22L", priceCents: 8900, inventoryQty: 65, status: "active" },
    { id: "prod_wool_socks", storeId: store.id, title: "Merino Wool Socks", priceCents: 2200, inventoryQty: 200, status: "active" }
  ];
  for (const p of products) db.products.set(p.id, p);

  // Demo traffic: the jacket is hot, the socks are quiet, plus some bot noise to prove quarantine works.
  const now = Date.now();
  const MIN = 60_000;
  const push = (productId: string, type: EventType, anonId: string, ageMs: number, botScore = 0) =>
    db.events.push({ id: nextId("evt"), storeId: store.id, productId, type, anonId, at: now - ageMs, botScore });

  for (let i = 0; i < 14; i++) push("prod_trail_jacket", "view", `anon_${i}`, Math.floor(Math.random() * 4 * MIN));
  for (let i = 0; i < 5; i++) push("prod_trail_jacket", "add_to_cart", `anon_cart_${i}`, Math.floor(Math.random() * 12 * MIN));
  for (let i = 0; i < 7; i++) push("prod_trail_jacket", "purchase", `anon_buy_${i}`, Math.floor(Math.random() * 55 * MIN));
  for (let i = 0; i < 12; i++) push("prod_trail_jacket", "view", `bot_${i}`, Math.floor(Math.random() * 2 * MIN), 0.95);
  push("prod_wool_socks", "view", "anon_quiet_1", 30 * MIN);
  push("prod_day_pack", "view", "anon_20", 2 * MIN);
  push("prod_day_pack", "view", "anon_21", 3 * MIN);

  const stream: LiveStream = { id: "stream_launch", storeId: store.id, hostId: "host_maya", status: "live", startedAt: now - 20 * MIN };
  db.streams.set(stream.id, stream);
}
