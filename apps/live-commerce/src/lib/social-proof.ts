/**
 * Moat: Social Proof Engine.
 * Transforms anonymous storefront events into confidence-scored, display-safe proof
 * messages. Low-quality traffic (high botScore) is quarantined before aggregation so
 * scripted traffic cannot manufacture fake proof.
 */
import type { VisitorEvent } from "./store.js";

const MIN = 60_000;
export const BOT_THRESHOLD = 0.7;
export const MESSAGE_TTL_MS = 15 * MIN;

export const WINDOWS = {
  activeViewers: 5 * MIN,
  addToCart: 15 * MIN,
  purchases: 60 * MIN,
  uniqueViews: 24 * 60 * MIN
} as const;

export type RuleType = "active_viewers" | "recent_purchases" | "cart_activity";

export interface SocialProofRule {
  id: string; storeId: string; ruleType: RuleType;
  minValue: number; minConfidence: number; template: string;
}
export interface ProofMessage {
  id: string; storeId: string; productId: string; ruleType: RuleType;
  message: string; confidence: number; metricValue: number; expiresAt: number;
}
export interface ProofResult {
  messages: ProofMessage[];
  stats: { evaluatedProducts: number; quarantinedEvents: number };
}

interface WindowMetrics {
  activeViewers: number; viewEvents5m: number; addToCart15m: number;
  purchases1h: number; uniqueViews24h: number; quarantined: number; total: number;
}

function metricsFor(productId: string, events: VisitorEvent[], now: number): WindowMetrics {
  const relevant = events.filter((e) => e.productId === productId);
  const clean = relevant.filter((e) => (e.botScore ?? 0) <= BOT_THRESHOLD);
  const views5m = clean.filter((e) => e.type === "view" && now - e.at <= WINDOWS.activeViewers);
  return {
    activeViewers: new Set(views5m.map((e) => e.anonId)).size,
    viewEvents5m: views5m.length,
    addToCart15m: clean.filter((e) => e.type === "add_to_cart" && now - e.at <= WINDOWS.addToCart).length,
    purchases1h: clean.filter((e) => e.type === "purchase" && now - e.at <= WINDOWS.purchases).length,
    uniqueViews24h: new Set(clean.filter((e) => e.type === "view" && now - e.at <= WINDOWS.uniqueViews).map((e) => e.anonId)).size,
    quarantined: relevant.length - clean.length,
    total: relevant.length
  };
}

function metricValue(m: WindowMetrics, ruleType: RuleType): number {
  if (ruleType === "active_viewers") return m.activeViewers;
  if (ruleType === "recent_purchases") return m.purchases1h;
  return m.addToCart15m;
}

function confidence(m: WindowMetrics, value: number, rule: SocialProofRule): number {
  const botRatio = m.total === 0 ? 0 : m.quarantined / m.total;
  const density = Math.min(1, value / (rule.minValue * 3));
  const uniqueViewerRatio = m.viewEvents5m === 0 ? 1 : Math.min(1, m.activeViewers / m.viewEvents5m);
  return Math.max(0, Math.min(1, 0.5 * (1 - botRatio) + 0.25 * density + 0.25 * uniqueViewerRatio));
}

export function renderTemplate(template: string, vars: Record<string, number | string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

export function computeSocialProof(
  storeId: string,
  events: VisitorEvent[],
  rules: SocialProofRule[],
  productIds: string[],
  now: number = Date.now()
): ProofResult {
  const messages: ProofMessage[] = [];
  let quarantinedEvents = 0;
  const storeRules = rules.filter((r) => r.storeId === storeId);

  for (const productId of productIds) {
    const m = metricsFor(productId, events, now);
    quarantinedEvents += m.quarantined;
    for (const rule of storeRules) {
      const value = metricValue(m, rule.ruleType);
      if (value < rule.minValue) continue;
      const conf = confidence(m, value, rule);
      if (conf < rule.minConfidence) continue;
      messages.push({
        id: `proof_${rule.id}_${productId}`,
        storeId, productId, ruleType: rule.ruleType,
        message: renderTemplate(rule.template, { count: value }),
        confidence: Number(conf.toFixed(3)),
        metricValue: value,
        expiresAt: now + MESSAGE_TTL_MS
      });
    }
  }
  return { messages, stats: { evaluatedProducts: productIds.length, quarantinedEvents } };
}

/** Default rule set applied to new stores. */
export function defaultRules(storeId: string): SocialProofRule[] {
  return [
    { id: "r_viewers", storeId, ruleType: "active_viewers", minValue: 5, minConfidence: 0.4, template: "{count} people are viewing this right now" },
    { id: "r_purchases", storeId, ruleType: "recent_purchases", minValue: 3, minConfidence: 0.4, template: "{count} sold in the last hour" },
    { id: "r_cart", storeId, ruleType: "cart_activity", minValue: 3, minConfidence: 0.4, template: "{count} just added this to their cart" }
  ];
}

/** Single-use, stream-bound checkout tokens (moat: embedded buy-now without redirect loops). */
export function redeemTokenState(token: { expiresAt: number; usedAt?: number }, now: number = Date.now()):
  { ok: true } | { ok: false; reason: "expired" | "used" } {
  if (token.usedAt !== undefined) return { ok: false, reason: "used" };
  if (now > token.expiresAt) return { ok: false, reason: "expired" };
  return { ok: true };
}
