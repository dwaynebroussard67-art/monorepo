/** In-memory data store. Production target: PostgreSQL + graph store + Redis signaling (see prisma/schema.prisma). */

export interface Event { id: string; title: string; startsAt: number }
export interface VenueZone { id: string; eventId: string; name: string }
export interface AttendeeProfile {
  id: string; eventId: string; name: string; headline: string;
  goals: string[]; interests: string[]; company: string; role: string; optedIn: boolean;
}
export interface MatchScore { eventId: string; attendeeA: string; attendeeB: string; score: number; rationale: string[]; suppressed: boolean }
export interface TopMatchList { eventId: string; attendeeId: string; matches: Array<{ attendeeId: string; score: number; rationale: string[] }>; generatedAt: number }
export interface ProximitySignal { id: string; eventId: string; fromId: string; toId: string; zoneId: string; status: "pending" | "accepted" | "declined"; createdAt: number }
export interface Connection { id: string; eventId: string; attendeeA: string; attendeeB: string; createdAt: number }

export const db = {
  events: new Map<string, Event>(),
  zones: new Map<string, VenueZone>(),
  attendees: new Map<string, AttendeeProfile>(),
  matchScores: new Map<string, MatchScore>(), // key: eventId: a|b (sorted)
  topLists: new Map<string, TopMatchList>(), // key: eventId:attendeeId
  signals: new Map<string, ProximitySignal>(),
  connections: [] as Connection[]
};

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

let seeded = false;
export function seed() {
  if (seeded) return;
  seeded = true;
  const now = Date.now();
  const ev: Event = { id: "ev_founders", title: "Founders & Funders Night", startsAt: now + 24 * 60 * 60_000 };
  db.events.set(ev.id, ev);
  db.zones.set("zone_main", { id: "zone_main", eventId: ev.id, name: "Main hall" });
  db.zones.set("zone_lounge", { id: "zone_lounge", eventId: ev.id, name: "Investor lounge" });

  const attendees: AttendeeProfile[] = [
    { id: "att_faye", eventId: ev.id, name: "Faye Lin", headline: "Founder, Loomly", goals: ["fundraising"], interests: ["saas", "pricing", "growth"], company: "Loomly", role: "founder", optedIn: true },
    { id: "att_ivan", eventId: ev.id, name: "Ivan Roth", headline: "Partner, Northcap", goals: ["deal_flow"], interests: ["saas", "fintech", "growth"], company: "Northcap", role: "investor", optedIn: true },
    { id: "att_helen", eventId: ev.id, name: "Helen Duarte", headline: "VP Eng, Kite", goals: ["hiring"], interests: ["design", "product"], company: "Kite", role: "exec", optedIn: true },
    { id: "att_jay", eventId: ev.id, name: "Jay Cole", headline: "Product designer", goals: ["job_seeking"], interests: ["design", "product", "growth"], company: "Independent", role: "designer", optedIn: true },
    { id: "att_sam", eventId: ev.id, name: "Sam Bright", headline: "Data lead", goals: ["learning"], interests: ["data", "ml"], company: "Datagrove", role: "engineer", optedIn: true },
    { id: "att_sid", eventId: ev.id, name: "Sid Bright", headline: "ML engineer", goals: ["learning"], interests: ["data", "ml"], company: "Datagrove", role: "engineer", optedIn: false }
  ];
  for (const a of attendees) db.attendees.set(a.id, a);

  // Faye and Sam already know each other — prior connections must be suppressed from matches.
  db.connections.push({ id: nextId("conn"), eventId: ev.id, attendeeA: "att_faye", attendeeB: "att_sam", createdAt: now - 60 * 24 * 60 * 60_000 });
}
