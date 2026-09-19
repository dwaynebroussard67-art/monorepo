/**
 * Moat: Send Time Personalization.
 * Per-subscriber minute-level open/click histograms with recency decay, a cold-start
 * fallback hierarchy (subscriber -> segment -> timezone -> global), window-constrained
 * argmax scheduling, and a dynamic dispatch queue that reflows when throughput changes.
 *
 * Timezone handling: histogram buckets use the subscriber's LOCAL minute-of-week
 * (UTC + tz offset). DST transitions are approximated by the offset at write time —
 * production must re-derive offsets with a tz database at schedule time.
 */
import type { EngagementEvent, SendProfile, Subscriber } from "./store.js";

export const SLOT_MIN = 10;
const SLOTS_PER_HOUR = 60 / SLOT_MIN;
export const SLOTS_PER_WEEK = 7 * 24 * SLOTS_PER_HOUR;
const HALF_LIFE_DAYS = 30;
export const COLD_START_MIN_EVENTS = 5;

export function slotKeyFor(epochMs: number, tzOffsetMinutes = 0): number {
  const local = new Date(epochMs + tzOffsetMinutes * 60_000);
  return local.getUTCDay() * 24 * SLOTS_PER_HOUR + local.getUTCHours() * SLOTS_PER_HOUR + Math.floor(local.getUTCMinutes() / SLOT_MIN);
}

/** Weighted histogram: clicks count double; exponential recency decay. */
export function buildHistogram(events: EngagementEvent[], tzOffsetMinutes: number, now: number = Date.now()): Map<number, number> {
  const hist = new Map<number, number>();
  for (const e of events) {
    const ageDays = (now - e.occurredAt) / 86_400_000;
    const weight = (e.type === "click" ? 2 : 1) * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    const key = slotKeyFor(e.occurredAt, tzOffsetMinutes);
    hist.set(key, (hist.get(key) ?? 0) + weight);
  }
  return hist;
}

export function mergeHistograms(hists: Array<Map<number, number>>): Map<number, number> {
  const merged = new Map<number, number>();
  for (const h of hists) for (const [k, v] of h) merged.set(k, (merged.get(k) ?? 0) + v);
  return merged;
}

export interface ProfileInput {
  subscriber: Subscriber;
  events: EngagementEvent[];
  /** Fallback chain histograms: segment average, timezone-cohort average, global average. */
  segmentHist?: Map<number, number>;
  timezoneHist?: Map<number, number>;
  globalHist: Map<number, number>;
}

export function buildProfile(input: ProfileInput, now: number = Date.now()): SendProfile {
  const { subscriber, events } = input;
  const tzOffset = tzOffsetMinutes(subscriber.tz);
  if (events.length >= COLD_START_MIN_EVENTS) {
    const hist = buildHistogram(events, tzOffset, now);
    return serialize(subscriber.id, "personalized", Math.min(1, events.length / 20), hist, now);
  }
  if (input.segmentHist && input.segmentHist.size > 0) return serialize(subscriber.id, "segment", 0.35, input.segmentHist, now);
  if (input.timezoneHist && input.timezoneHist.size > 0) return serialize(subscriber.id, "timezone", 0.3, input.timezoneHist, now);
  return serialize(subscriber.id, "global", 0.25, input.globalHist, now);
}

function serialize(subscriberId: string, source: SendProfile["source"], confidence: number, hist: Map<number, number>, now: number): SendProfile {
  const topSlots = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([slotKey, score]) => ({ slotKey, score: Number(score.toFixed(3)) }));
  return { subscriberId, source, confidence: Number(confidence.toFixed(2)), topSlots, generatedAt: now };
}

/** Scaffold tz support: UTC and whole-hour offsets (e.g. "UTC", "UTC+2", "UTC-5"). */
export function tzOffsetMinutes(tz: string): number {
  const m = tz.match(/^UTC([+-]\d{1,2})?$/);
  if (!m) return 0;
  return m[1] ? parseInt(m[1], 10) * 60 : 0;
}

/** argmax P(open) within the campaign window, constrained to 10-minute slot starts. */
export function bestSlotInWindow(hist: Map<number, number>, windowStart: number, windowEnd: number, tzOffset: number): { releaseAt: number; score: number } | undefined {
  let best: { releaseAt: number; score: number } | undefined;
  const firstSlot = Math.ceil(windowStart / (SLOT_MIN * 60_000)) * SLOT_MIN * 60_000;
  for (let t = firstSlot; t < windowEnd; t += SLOT_MIN * 60_000) {
    const score = hist.get(slotKeyFor(t, tzOffset)) ?? 0;
    if (!best || score > best.score) best = { releaseAt: t, score: Number(score.toFixed(3)) };
  }
  return best;
}

export interface QueueLike { releaseAt: number; status: string }

/** Due now, oldest first. `throughput` caps how many are released per run. */
export function dueForDispatch<T extends QueueLike>(entries: T[], now: number, throughput: number): T[] {
  return entries.filter((e) => e.status === "pending" && e.releaseAt <= now)
    .sort((a, b) => a.releaseAt - b.releaseAt)
    .slice(0, Math.max(1, throughput));
}

/** Reflow pending entries to respect a new throughput: batch i releases at now + i minutes. */
export function reflowQueue<T extends { releaseAt: number; status: string }>(entries: T[], newThroughputPerMinute: number, now: number = Date.now()): number {
  const pending = entries.filter((e) => e.status === "pending").sort((a, b) => a.releaseAt - b.releaseAt);
  let moved = 0;
  pending.forEach((entry, idx) => {
    const batchIndex = Math.floor(idx / Math.max(1, newThroughputPerMinute));
    const newRelease = Math.max(entry.releaseAt, now + batchIndex * 60_000);
    if (newRelease !== entry.releaseAt) { entry.releaseAt = newRelease; moved++; }
  });
  return moved;
}
