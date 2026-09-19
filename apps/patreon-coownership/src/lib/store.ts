/** In-memory data store. Production target: Prisma repositories (see prisma/schema.prisma). */

export interface Creator { id: string; userId: string; brandName: string }
export interface Tier { id: string; creatorId: string; name: string; monthlyPriceCents: number }
export interface Subscription { id: string; tierId: string; fanUserId: string; status: "active" | "ended"; startedAt: number; endedAt?: number }
export interface EngagementEvent { id: string; creatorId: string; fanUserId: string; type: string; weight: number; occurredAt: number }
export interface SuperfanScore { id: string; creatorId: string; fanUserId: string; score: number; factors: Record<string, number>; updatedAt: number }
export interface OwnershipProgram { id: string; creatorId: string; rightsType: string; status: "draft" | "active"; rules: { unitsPerScorePoint: number; capUnitsPerFan: number } }
export interface LedgerEntry { id: string; programId: string; debitAccountId: string; creditAccountId: string; units: number; reason: string; createdAt: number }
export interface RevenuePool { id: string; creatorId: string; sourceType: string; periodStart: number; periodEnd: number; distributableCents: number }
export interface Distribution { id: string; revenuePoolId: string; fanUserId: string; units: number; sharePercent: number; payoutCents: number }

/** fan stats ledger helpers compute scores from */
export interface FanFacts { monthsSubscribed: number; lifetimeSpendCents: number; approvedModerationActions: number; successfulReferrals: number; fraudFlags: number }

export const db = {
  creators: new Map<string, Creator>(),
  tiers: new Map<string, Tier>(),
  subscriptions: new Map<string, Subscription>(),
  engagement: [] as EngagementEvent[],
  scores: new Map<string, SuperfanScore>(), // key: creatorId:fanUserId
  programs: new Map<string, OwnershipProgram>(),
  ledger: [] as LedgerEntry[],
  pools: new Map<string, RevenuePool>(),
  distributions: [] as Distribution[],
  fanFacts: new Map<string, FanFacts>() // key: creatorId:fanUserId; production: derived from events
};

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
}

export function fanKey(creatorId: string, fanUserId: string): string {
  return `${creatorId}:${fanUserId}`;
}

let seeded = false;
export function seed() {
  if (seeded) return;
  seeded = true;

  const creator: Creator = { id: "creator_cora", userId: "user_cora", brandName: "Cora's Forge" };
  db.creators.set(creator.id, creator);
  const founding: Tier = { id: nextId("tier"), creatorId: creator.id, name: "Founding Circle", monthlyPriceCents: 2500 };
  const supporter: Tier = { id: nextId("tier"), creatorId: creator.id, name: "Supporter", monthlyPriceCents: 800 };
  db.tiers.set(founding.id, founding);
  db.tiers.set(supporter.id, supporter);

  const now = Date.now();
  const MONTH = 30 * 24 * 60 * 60_000;
  for (const [fanId, tier, monthsAgo] of [
    ["fan_ana", founding.id, 12],
    ["fan_ben", supporter.id, 6],
    ["fan_cleo", supporter.id, 1]
  ] as const) {
    const sub: Subscription = { id: nextId("sub"), tierId: tier, fanUserId: fanId, status: "active", startedAt: now - monthsAgo * MONTH };
    db.subscriptions.set(sub.id, sub);
  }

  db.fanFacts.set(fanKey(creator.id, "fan_ana"), { monthsSubscribed: 12, lifetimeSpendCents: 42_000, approvedModerationActions: 4, successfulReferrals: 3, fraudFlags: 0 });
  db.fanFacts.set(fanKey(creator.id, "fan_ben"), { monthsSubscribed: 6, lifetimeSpendCents: 9_000, approvedModerationActions: 1, successfulReferrals: 0, fraudFlags: 0 });
  db.fanFacts.set(fanKey(creator.id, "fan_cleo"), { monthsSubscribed: 1, lifetimeSpendCents: 800, approvedModerationActions: 0, successfulReferrals: 5, fraudFlags: 2 });

  const program: OwnershipProgram = { id: "prog_forge", creatorId: creator.id, rightsType: "rev_share_credits", status: "active", rules: { unitsPerScorePoint: 10, capUnitsPerFan: 2000 } };
  db.programs.set(program.id, program);
  db.pools.set("pool_october", { id: "pool_october", creatorId: creator.id, sourceType: "sponsorship", periodStart: now - MONTH, periodEnd: now, distributableCents: 1_000_000 });
}
