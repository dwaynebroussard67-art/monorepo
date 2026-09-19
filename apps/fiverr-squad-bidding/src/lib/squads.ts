/**
 * Moat: Collaborative bidding.
 * Squads are first-class contractable delivery units: skill-coverage squad suggestions,
 * split-matrix validation, versioned shared proposals, unified contract generation, and
 * escrow disbursement that releases milestones into exact-cent payout splits.
 */
import type { Freelancer, Project, Squad, SquadMember } from "./store.js";

export const SKILL_CATALOG = ["react", "node", "typescript", "design", "devops", "python", "ml", "ios", "qa", "data"] as const;

export function parseScope(scope: string): string[] {
  const lower = scope.toLowerCase();
  return SKILL_CATALOG.filter((skill) => new RegExp(`\\b${skill}\\b`).test(lower));
}

export interface SquadSuggestion {
  memberIds: string[]; coverage: number; score: number;
  coveredSkills: string[]; missingSkills: string[];
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [head, ...tail] = items;
  return [...combinations(tail, size - 1).map((c) => [head!, ...c]), ...combinations(tail, size)];
}

export function suggestSquads(requiredSkills: string[], freelancers: Freelancer[], topN = 3, maxSize = 4): SquadSuggestion[] {
  if (requiredSkills.length === 0) return [];
  const suggestions: SquadSuggestion[] = [];
  for (let size = 1; size <= Math.min(maxSize, freelancers.length); size++) {
    for (const combo of combinations(freelancers, size)) {
      const covered = new Set(combo.flatMap((f) => f.skills));
      const coveredSkills = requiredSkills.filter((s) => covered.has(s));
      const coverage = coveredSkills.length / requiredSkills.length;
      if (coverage < 1) continue; // full-skill coverage is the squad constraint
      const avgRating = combo.reduce((sum, f) => sum + f.rating, 0) / combo.length;
      const tzOffsets = combo.map((f) => f.timezoneOffset);
      const tzSpread = Math.max(...tzOffsets) - Math.min(...tzOffsets);
      const wastedOverlap = combo.flatMap((f) => f.skills).length - covered.size; // duplicate-skill waste
      const score = 10 + avgRating - 0.15 * tzSpread - 0.3 * wastedOverlap;
      suggestions.push({
        memberIds: combo.map((f) => f.id).sort(), coverage, score: Number(score.toFixed(2)),
        coveredSkills, missingSkills: []
      });
    }
  }
  const seen = new Set<string>();
  return suggestions
    .sort((a, b) => b.score - a.score)
    .filter((s) => { const key = s.memberIds.join("|"); if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, topN);
}

export function validateSplits(members: SquadMember[]): { ok: true } | { ok: false; error: string } {
  if (members.length === 0) return { ok: false, error: "squad_needs_members" };
  const sum = members.reduce((total, m) => total + m.splitPercent, 0);
  if (sum !== 100) return { ok: false, error: `splits_must_sum_to_100 (got ${sum})` };
  if (members.some((m) => m.splitPercent <= 0)) return { ok: false, error: "every_member_needs_a_positive_split" };
  return { ok: true };
}

export function generateContractTerms(project: Project, squad: Squad, milestonePlan: Array<{ title: string; amountCents: number; ownerFreelancerId: string }>): Record<string, unknown> {
  const totalMilestones = milestonePlan.reduce((sum, m) => sum + m.amountCents, 0);
  if (totalMilestones > project.budgetCents) throw new Error("milestones_exceed_project_budget");
  return {
    parties: { clientId: project.clientId, squadId: squad.id, leadFreelancerId: squad.leadFreelancerId },
    roleMatrix: squad.members.map((m) => ({ freelancerId: m.freelancerId, roleTitle: m.roleTitle, splitPercent: m.splitPercent })),
    milestonePlan,
    escrowPolicy: "single escrow opened on acceptance; each approval releases into the split table",
    budgetCents: project.budgetCents,
    version: 1
  };
}

/** Largest-remainder cent allocation; the payout column always sums to amountCents exactly. */
export function payoutSplits(amountCents: number, members: SquadMember[]): Map<string, number> {
  const result = new Map<string, number>();
  const shares = members.map((m) => {
    const raw = (amountCents * m.splitPercent) / 100;
    return { id: m.freelancerId, floor: Math.floor(raw), remainder: raw - Math.floor(raw) };
  });
  for (const s of shares) result.set(s.id, s.floor);
  let centsLeft = amountCents - shares.reduce((sum, s) => sum + s.floor, 0);
  for (const s of [...shares].sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id))) {
    if (centsLeft === 0) break;
    result.set(s.id, (result.get(s.id) ?? 0) + 1);
    centsLeft -= 1;
  }
  return result;
}
