/**
 * Moat: Serendipity matchmaking.
 * Pre-event graph ranking that blends interest similarity with GOAL COMPLEMENTARITY
 * (hiring↔job seeking, founder↔investor, mentor↔mentee), penalizes duplicate-context
 * pairs (same company/role), suppresses prior connections, and enforces diversity in
 * each Top-5 brief. Live signaling is gated to pre-ranked, opted-in pairs inside
 * authorized venue zones — never ambient location tracking.
 */
import type { AttendeeProfile, MatchScore } from "./store.js";

const COMPLEMENTARY: Record<string, string[]> = {
  fundraising: ["deal_flow"], deal_flow: ["fundraising"],
  hiring: ["job_seeking"], job_seeking: ["hiring"],
  mentoring: ["seeking_mentor"], seeking_mentor: ["mentoring"],
  selling: ["buying"], buying: ["selling"]
};

export function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a.map((s) => s.toLowerCase()));
  const sb = new Set(b.map((s) => s.toLowerCase()));
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

export function scorePair(a: AttendeeProfile, b: AttendeeProfile, priorPairKeys: Set<string>): Pick<MatchScore, "score" | "rationale" | "suppressed"> {
  const rationale: string[] = [];
  if (priorPairKeys.has(pairKey(a.id, b.id))) {
    return { score: -100, rationale: ["prior connection — suppressed"], suppressed: true };
  }
  const similarity = jaccard(a.interests, b.interests);
  let score = Math.round(similarity * 25);
  if (similarity > 0) rationale.push(`shared interests (${Math.round(similarity * 100)}% overlap): +${Math.round(similarity * 25)}`);

  const complementary = a.goals.some((g) => (COMPLEMENTARY[g] ?? []).some((c) => b.goals.includes(c)))
    || b.goals.some((g) => (COMPLEMENTARY[g] ?? []).some((c) => a.goals.includes(c)));
  if (complementary) { score += 40; rationale.push("complementary goals: +40"); }

  if (a.company.toLowerCase() === b.company.toLowerCase()) { score -= 30; rationale.push("same company: -30"); }
  if (a.role.toLowerCase() === b.role.toLowerCase()) { score -= 10; rationale.push("same role: -10"); }
  if (rationale.length === 0) rationale.push("weak signal");
  return { score, rationale, suppressed: false };
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}
export { pairKey };

/** Top-N with a diversity constraint: at most one match per company. */
export function topMatchesFor(
  attendee: AttendeeProfile,
  candidates: AttendeeProfile[],
  priorPairKeys: Set<string>,
  topN = 5
): Array<{ attendeeId: string; score: number; rationale: string[] }> {
  const scored = candidates
    .filter((c) => c.id !== attendee.id && c.optedIn)
    .map((c) => {
      const { score, rationale, suppressed } = scorePair(attendee, c, priorPairKeys);
      return { attendeeId: c.id, company: c.company, score, rationale, suppressed };
    })
    .filter((s) => !s.suppressed)
    .sort((x, y) => y.score - x.score);

  const picks: Array<{ attendeeId: string; score: number; rationale: string[] }> = [];
  const usedCompanies = new Set<string>();
  for (const s of scored) {
    if (picks.length >= topN) break;
    const key = s.company.toLowerCase();
    if (usedCompanies.has(key)) continue; // diversity constraint
    usedCompanies.add(key);
    picks.push({ attendeeId: s.attendeeId, score: s.score, rationale: s.rationale });
  }
  return picks;
}

export type SignalGate = { allowed: true } | { allowed: false; reason: string };

/** Live gate: both opted in, pair appears in the signaler's Top list, zone belongs to the event. */
export function canSignal(args: {
  from: AttendeeProfile; to: AttendeeProfile;
  zoneEventIds: string[]; eventId: string;
  topList: Array<{ attendeeId: string }> | undefined;
}): SignalGate {
  if (!args.from.optedIn) return { allowed: false, reason: "signaler_not_opted_in" };
  if (!args.to.optedIn) return { allowed: false, reason: "target_not_opted_in" };
  if (!args.zoneEventIds.includes(args.eventId)) return { allowed: false, reason: "zone_not_in_event" };
  if (!args.topList?.some((m) => m.attendeeId === args.to.id)) return { allowed: false, reason: "pair_not_ranked_generate_matches_first" };
  return { allowed: true };
}
