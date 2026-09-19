/** In-memory data store. Production target: Prisma repositories (see prisma/schema.prisma). */

export interface User { id: string; email: string; name: string; timezone: string }
export interface AvailabilityRule { id: string; userId: string; dayOfWeek: number; startMinute: number; endMinute: number }
export interface EventType { id: string; userId: string; title: string; durationMin: number; bufferBeforeMin: number; bufferAfterMin: number; slug: string }
export interface Booking {
  id: string; eventTypeId: string; hostUserId: string;
  inviteeName: string; inviteeEmail: string;
  startAt: number; endAt: number; status: "confirmed" | "cancelled"; createdAt: number;
}
export interface Participant { id: string; bookingId: string; role: "host" | "invitee"; email: string; fullName: string; company?: string; profileUrl?: string }
export interface BriefSignal { source: string; summary: string; confidence: number }
export interface Brief { id: string; bookingId: string; audience: "host" | "invitee"; markdown: string; signals: BriefSignal[]; generatedAt: number }
export interface Transcript { id: string; bookingId: string; text: string; createdAt: number }
export interface ActionItem { title: string; owner?: string; dueAt?: number; confidence: number; needsReview: boolean }
export interface MeetingSummary { id: string; bookingId: string; markdown: string; decisions: string[]; actionItems: ActionItem[]; generatedAt: number }
export interface Reminder { id: string; bookingId: string; channel: "email"; scheduledAt: number; status: "scheduled" | "sent" | "cancelled" }
export interface SyncLog { id: string; bookingId: string; kind: "calendar" | "crm"; provider: string; idempotencyKey: string; payload: unknown; status: "synced" }

export const db = {
  users: new Map<string, User>(),
  rules: new Map<string, AvailabilityRule>(),
  eventTypes: new Map<string, EventType>(),
  bookings: new Map<string, Booking>(),
  participants: new Map<string, Participant>(),
  briefs: new Map<string, Brief>(),
  transcripts: new Map<string, Transcript>(),
  summaries: new Map<string, MeetingSummary>(),
  reminders: new Map<string, Reminder>(),
  syncLogs: new Map<string, SyncLog>(), // key: idempotencyKey
  enrichments: new Map<string, BriefSignal[]>() // key: lowercase email; production: enrichment pipeline output
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

  const host: User = { id: "user_maya", email: "maya@aurora.example", name: "Maya Chen", timezone: "UTC" };
  db.users.set(host.id, host);

  for (let dow = 1; dow <= 5; dow++) {
    const rule: AvailabilityRule = { id: nextId("rule"), userId: host.id, dayOfWeek: dow, startMinute: 9 * 60, endMinute: 17 * 60 };
    db.rules.set(rule.id, rule);
  }

  const intro: EventType = { id: nextId("et"), userId: host.id, title: "Intro Call", durationMin: 30, bufferBeforeMin: 5, bufferAfterMin: 5, slug: "intro" };
  const demo: EventType = { id: nextId("et"), userId: host.id, title: "Product Demo", durationMin: 45, bufferBeforeMin: 10, bufferAfterMin: 10, slug: "demo" };
  db.eventTypes.set(intro.id, intro);
  db.eventTypes.set(demo.id, demo);

  // Demo enrichment data (production: people/company enrichment pipeline per blueprint).
  db.enrichments.set("sam@nimbus.io", [
    { source: "profile", summary: "Sam Rivera — VP Product at Nimbus (ex-Loopwell)", confidence: 0.9 },
    { source: "crm", summary: "Nimbus is an active opportunity in pipeline stage: evaluation", confidence: 0.85 },
    { source: "news", summary: "Nimbus announced Series B funding last month", confidence: 0.75 },
    { source: "graph", summary: "2 shared connections with Maya via the Aurora founder network", confidence: 0.6 }
  ]);
}
