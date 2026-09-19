/** In-memory data store. Production target: PostgreSQL + ClickHouse + Redis queue (see prisma/schema.prisma). */

export interface Audience { id: string; name: string }
export interface Subscriber { id: string; audienceId: string; email: string; tz: string; segment?: string }
export interface EngagementEvent { id: string; subscriberId: string; type: "open" | "click"; occurredAt: number }
export interface SendProfile {
  subscriberId: string; source: "personalized" | "segment" | "timezone" | "global";
  confidence: number; topSlots: Array<{ slotKey: number; score: number }>; generatedAt: number;
}
export interface Campaign { id: string; audienceId: string; subject: string; windowStart: number; windowEnd: number; status: "draft" | "launched" }
export interface QueueEntry { id: string; campaignId: string; subscriberId: string; releaseAt: number; predictedScore: number; status: "pending" | "sent" }

export const db = {
  audiences: new Map<string, Audience>(),
  subscribers: new Map<string, Subscriber>(),
  engagement: [] as EngagementEvent[],
  profiles: new Map<string, SendProfile>(), // key: subscriberId
  campaigns: new Map<string, Campaign>(),
  queue: new Map<string, QueueEntry>()
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
  const now = Date.now();
  const DAY = 24 * 60 * 60_000;

  db.audiences.set("aud_aurora", { id: "aud_aurora", name: "Aurora product news" });
  db.subscribers.set("sub_ana", { id: "sub_ana", audienceId: "aud_aurora", email: "ana@example.com", tz: "UTC", segment: "founders" });
  db.subscribers.set("sub_ben", { id: "sub_ben", audienceId: "aud_aurora", email: "ben@example.com", tz: "UTC", segment: "founders" });
  db.subscribers.set("sub_cleo", { id: "sub_cleo", audienceId: "aud_aurora", email: "cleo@example.com", tz: "UTC" }); // cold start

  // ana: opens every Tuesday ~09:00 UTC for 9 weeks; ben: clicks/opens ~20:00 UTC for 9 weeks
  for (let week = 0; week < 9; week++) {
    const tuesday9am = nextDowUtc(2, 9, now) - week * 7 * DAY;
    db.engagement.push({ id: nextId("eng"), subscriberId: "sub_ana", type: "open", occurredAt: tuesday9am });
    const day20h = nextDowUtc(3, 20, now) - week * 7 * DAY;
    db.engagement.push({ id: nextId("eng"), subscriberId: "sub_ben", type: week % 3 === 0 ? "click" : "open", occurredAt: day20h });
  }
}

/** Most recent past occurrence of a UTC weekday+hour (for deterministic seed history). */
function nextDowUtc(targetDow: number, hour: number, from: number): number {
  const d = new Date(from);
  d.setUTCHours(hour, 0, 0, 0);
  let delta = (d.getUTCDay() - targetDow + 7) % 7;
  if (delta === 0 && d.getTime() > from) delta = 7;
  return d.getTime() - delta * 24 * 60 * 60_000;
}
