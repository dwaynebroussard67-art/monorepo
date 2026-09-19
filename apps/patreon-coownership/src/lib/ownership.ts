/**
 * Moat: Co-ownership economics.
 * - Superfan scoring (tenure / spend / moderation / referrals / fraud penalty)
 * - Append-only double-entry rights ledger (auditable, clawbackable)
 * - Pool distribution with exact-cent reconciliation via largest-remainder rounding
 *
 * Securities caution (blueprint §3): units here are rev-share credits / loyalty
 * participation, NOT equity. True equity requires counsel and legal wrappers.
 */
import type { FanFacts, LedgerEntry } from "./store.js";

export const WEIGHTS = {
  tenurePerMonth: 4,
  spendNormalized: 50,
  moderationPerAction: 5,
  referralPerSuccess: 8,
  fraudPenaltyPerFlag: -25
} as const;

export function superfanScore(facts: FanFacts, maxSpendCents: number): { score: number; factors: Record<string, number> } {
  const spendNorm = maxSpendCents === 0 ? 0 : facts.lifetimeSpendCents / maxSpendCents;
  const factors = {
    tenure: facts.monthsSubscribed * WEIGHTS.tenurePerMonth,
    spend: Number((spendNorm * WEIGHTS.spendNormalized).toFixed(2)),
    moderation: facts.approvedModerationActions * WEIGHTS.moderationPerAction,
    referrals: facts.successfulReferrals * WEIGHTS.referralPerSuccess,
    fraudPenalty: facts.fraudFlags * WEIGHTS.fraudPenaltyPerFlag
  };
  const score = Math.max(0, factors.tenure + factors.spend + factors.moderation + factors.referrals + factors.fraudPenalty);
  return { score: Number(score.toFixed(2)), factors };
}

export const SYSTEM_ACCOUNT = "system:issuance";

export function balancesFrom(entries: LedgerEntry[]): Map<string, number> {
  const balances = new Map<string, number>();
  for (const e of entries) {
    balances.set(e.debitAccountId, (balances.get(e.debitAccountId) ?? 0) - e.units);
    balances.set(e.creditAccountId, (balances.get(e.creditAccountId) ?? 0) + e.units);
  }
  return balances;
}

/** Ledger invariant: every entry debits and credits the same amount, so totals must be equal. */
export function verifyLedger(entries: LedgerEntry[]): { balanced: boolean; totalDebit: number; totalCredit: number } {
  const valid = entries.every((e) => e.units > 0 && e.debitAccountId !== e.creditAccountId);
  const total = entries.reduce((sum, e) => sum + e.units, 0);
  return { balanced: valid && Number.isFinite(total), totalDebit: total, totalCredit: total };
}

export function unitsForScore(score: number, rules: { unitsPerScorePoint: number; capUnitsPerFan: number }): number {
  return Math.min(rules.capUnitsPerFan, Math.max(0, Math.floor(score * rules.unitsPerScorePoint)));
}

/**
 * Pro-rata a cent amount by weight with exact reconciliation:
 * floor every share, then hand the remaining cents to the largest fractional remainders
 * (ties broken by account id for determinism). Sum of payouts ALWAYS equals amountCents.
 */
export function proRata(amountCents: number, weights: Map<string, number>): Map<string, number> {
  const result = new Map<string, number>();
  const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0);
  if (amountCents < 0 || !Number.isInteger(amountCents)) throw new Error("amount_must_be_nonnegative_integer_cents");
  if (totalWeight <= 0) return result;

  const shares = [...weights.entries()].map(([account, weight]) => {
    const raw = (amountCents * weight) / totalWeight;
    return { account, floor: Math.floor(raw), remainder: raw - Math.floor(raw) };
  });
  for (const s of shares) result.set(s.account, s.floor);

  let centsLeft = amountCents - shares.reduce((sum, s) => sum + s.floor, 0);
  for (const s of [...shares].sort((a, b) => b.remainder - a.remainder || a.account.localeCompare(b.account))) {
    if (centsLeft === 0) break;
    result.set(s.account, (result.get(s.account) ?? 0) + 1);
    centsLeft -= 1;
  }
  return result;
}
