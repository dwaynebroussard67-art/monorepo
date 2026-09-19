/**
 * Moat: Meeting Intelligence.
 * - Slot computation with buffers and booking collision
 * - Booking-triggered dual-sided pre-brief synthesis (signals ranked by confidence)
 * - Transcript -> decisions/action items with evidence-friendly confidence flags
 *
 * Note: scaffold computes availability in UTC. Production keeps user timezones and
 * normalizes per-viewer locale before slot math.
 */
import type { ActionItem, AvailabilityRule, Booking, Brief, BriefSignal, EventType, Participant } from "./store.js";

const MIN = 60_000;
export const BOOKING_LEAD_MS = 30 * MIN;

export interface Slot { startAt: number; endAt: number }

export function computeSlots(
  eventType: Pick<EventType, "durationMin" | "bufferBeforeMin" | "bufferAfterMin">,
  rules: AvailabilityRule[],
  bookings: Pick<Booking, "startAt" | "endAt" | "status">[],
  date: string,
  now: number = Date.now()
): Slot[] {
  const dayStart = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(dayStart) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const dow = new Date(dayStart).getUTCDay();
  const dayRules = rules.filter((r) => r.dayOfWeek === dow);
  const occupied = bookings
    .filter((b) => b.status === "confirmed")
    .map((b) => ({ start: b.startAt - eventType.bufferBeforeMin * MIN, end: b.endAt + eventType.bufferAfterMin * MIN }));

  const step = (eventType.durationMin + eventType.bufferBeforeMin + eventType.bufferAfterMin) * MIN;
  const slots: Slot[] = [];
  for (const rule of dayRules) {
    let start = dayStart + rule.startMinute * MIN;
    const latestStart = dayStart + rule.endMinute * MIN - eventType.durationMin * MIN;
    while (start <= latestStart) {
      const end = start + eventType.durationMin * MIN;
      const startsAfterLead = start >= now + BOOKING_LEAD_MS;
      const collides = occupied.some((o) => start < o.end && end > o.start);
      if (startsAfterLead && !collides) slots.push({ startAt: start, endAt: end });
      start += step;
    }
  }
  return slots;
}

export function isSlotAvailable(slot: Slot, computed: Slot[]): boolean {
  return computed.some((s) => s.startAt === slot.startAt && s.endAt === slot.endAt);
}

/** Normalize + dedupe identities across sources, then rank signals by confidence. */
export function rankSignals(participants: Participant[], enrichments: Map<string, BriefSignal[]>): BriefSignal[] {
  const seen = new Set<string>();
  const all: BriefSignal[] = [];
  for (const p of participants) {
    const key = p.email.toLowerCase();
    if (seen.has(key)) continue; // identity dedupe
    seen.add(key);
    all.push(...(enrichments.get(key) ?? []));
  }
  return [...all].sort((a, b) => b.confidence - a.confidence);
}

let briefCounter = 0;
/** Dual-sided briefs: one tuned for the host, one for the invitee. */
export function buildPreBriefs(booking: Booking, participants: Participant[], eventTypeTitle: string, enrichments: Map<string, BriefSignal[]>, now: number = Date.now()): Brief[] {
  const host = participants.find((p) => p.role === "host");
  const invitee = participants.find((p) => p.role === "invitee");
  const ranked = rankSignals(participants, enrichments).slice(0, 6);
  const when = new Date(booking.startAt).toISOString();
  const bullets = ranked.map((s) => `- (${Math.round(s.confidence * 100)}%) ${s.summary}`).join("\n");
  const mk = (audience: "host" | "invitee", focus: string): Brief => ({
    id: `brief_${(++briefCounter).toString(36)}`,
    bookingId: booking.id, audience,
    markdown: `# ${eventTypeTitle} — ${when}\n\n${focus}\n\n## Ranked context signals\n${bullets || "- No enrichment data available"}`,
    signals: ranked, generatedAt: now
  });
  return [
    mk("host", `You are meeting **${invitee?.fullName ?? "your invitee"}** (${invitee?.email ?? ""})${invitee?.company ? ` of ${invitee.company}` : ""}.`),
    mk("invitee", `You are meeting **${host?.fullName ?? "your host"}** (${host?.email ?? ""}).`)
  ];
}

const DUE_PATTERNS: Array<[RegExp, (m: RegExpMatchArray, from: number) => number | undefined]> = [
  [/by\s+(\d{4}-\d{2}-\d{2})/i, (m) => Date.parse(`${m[1]}T17:00:00Z`)],
  [/by\s+(today)/i, (_m, from) => from],
  [/by\s+tomorrow/i, (_m, from) => from + 24 * 60 * MIN],
  [/by\s+(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i, (m, from) => nextWeekday(m[1].toLowerCase(), from)]
];

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function nextWeekday(name: string, from: number): number | undefined {
  const target = WEEKDAYS.indexOf(name);
  if (target < 0) return undefined;
  const d = new Date(from);
  let delta = (target - d.getUTCDay() + 7) % 7;
  if (delta === 0) delta = 7;
  return from + delta * 24 * 60 * MIN;
}

/** Extract structured action items from a transcript/summary. Deterministic heuristic; items flag needsReview per blueprint compliance guidance. */
export function extractActionItems(text: string, now: number = Date.now()): ActionItem[] {
  const items: ActionItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const explicit = line.match(/^(?:ACTION|TODO)\s*:\s*(.+)$/i);
    const willDo = line.match(/^([A-Z][a-z]+)\s*:\s*(?:I'll|I will|we will)\s+(.+)$/);
    let owner: string | undefined;
    let task: string | undefined;
    if (explicit) task = explicit[1];
    else if (willDo) { owner = willDo[1]; task = willDo[2]; }
    if (!task) continue;
    let dueAt: number | undefined;
    for (const [re, fn] of DUE_PATTERNS) {
      const m = task.match(re);
      if (m) { dueAt = fn(m, now); task = task.replace(re, "").replace(/\s{2,}/g, " ").trim(); break; }
    }
    items.push({ title: task, owner, dueAt, confidence: owner && dueAt ? 0.85 : 0.6, needsReview: !(owner && dueAt) });
  }
  return items;
}

export function summarizeTranscript(text: string, now: number = Date.now()): { markdown: string; decisions: string[]; actionItems: ActionItem[] } {
  const decisions = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => /decid|agreed that|decision\s*:/i.test(l));
  const actionItems = extractActionItems(text, now);
  const markdown = [
    "## Decisions", ...(decisions.length ? decisions.map((d) => `- ${d}`) : ["- (none detected)"]),
    "", "## Action items",
    ...(actionItems.length
      ? actionItems.map((a) => `- ${a.owner ? `**${a.owner}** ` : ""}${a.title}${a.dueAt ? ` (due ${new Date(a.dueAt).toISOString().slice(0, 10)})` : ""}${a.needsReview ? " ⚠ needs review" : ""}`)
      : ["- (none detected)"])
  ].join("\n");
  return { markdown, decisions, actionItems };
}

/** Deterministic idempotency keys keep provider sync retry-safe. */
export function syncKey(bookingId: string, kind: "calendar" | "crm", provider: string, summaryVersion: number): string {
  return `${bookingId}:${kind}:${provider}:v${summaryVersion}`;
}
