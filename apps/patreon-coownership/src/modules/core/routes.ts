import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, fanKey, nextId, type Distribution } from "../../lib/store.js";
import { balancesFrom, proRata, superfanScore, SYSTEM_ACCOUNT, unitsForScore, verifyLedger } from "../../lib/ownership.js";

const eventWeightSchema = z.object({ fanUserId: z.string().min(1), type: z.enum(["view", "comment", "purchase", "moderation", "referral"]) });
const EVENT_WEIGHTS = { view: 1, comment: 3, purchase: 10, moderation: 5, referral: 8 } as const;

export async function coreRoutes(app: FastifyInstance) {
  app.get("/creators", async () => ({ ok: true as const, data: [...db.creators.values()] }));

  app.post("/creators/:creatorId/engagement", async (req, reply) => {
    const { creatorId } = req.params as { creatorId: string };
    if (!db.creators.has(creatorId)) return reply.code(404).send({ ok: false, error: "creator_not_found" });
    const parsed = eventWeightSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const event = { id: nextId("eng"), creatorId, fanUserId: parsed.data.fanUserId, type: parsed.data.type, weight: EVENT_WEIGHTS[parsed.data.type], occurredAt: Date.now() };
    db.engagement.push(event);
    return reply.code(202).send({ ok: true, data: event });
  });

  /** Moat step 1: superfan scoring job. */
  app.post("/creators/:creatorId/scores/run", async (req, reply) => {
    const { creatorId } = req.params as { creatorId: string };
    if (!db.creators.has(creatorId)) return reply.code(404).send({ ok: false, error: "creator_not_found" });
    const factsEntries = [...db.fanFacts.entries()].filter(([k]) => k.startsWith(`${creatorId}:`));
    if (factsEntries.length === 0) return reply.code(400).send({ ok: false, error: "no_fan_data" });
    const maxSpend = Math.max(...factsEntries.map(([, f]) => f.lifetimeSpendCents));
    const results = factsEntries.map(([key, facts]) => {
      const fanUserId = key.split(":")[1]!;
      const { score, factors } = superfanScore(facts, maxSpend);
      const record = { id: nextId("score"), creatorId, fanUserId, score, factors, updatedAt: Date.now() };
      db.scores.set(key, record);
      return record;
    });
    return { ok: true, data: results.sort((a, b) => b.score - a.score) };
  });

  /** Moat step 2: accrue scores into rights-unit ledger postings (append-only). */
  app.post("/programs/:programId/accrue", async (req, reply) => {
    const { programId } = req.params as { programId: string };
    const program = db.programs.get(programId);
    if (!program) return reply.code(404).send({ ok: false, error: "program_not_found" });
    if (program.status !== "active") return reply.code(409).send({ ok: false, error: "program_not_active" });
    const creatorScores = [...db.scores.entries()].filter(([k]) => k.startsWith(`${program.creatorId}:`));
    if (creatorScores.length === 0) return reply.code(400).send({ ok: false, error: "no_scores_run_scores_first" });
    const entries = creatorScores
      .map(([, scoreRec]) => ({ fanUserId: scoreRec.fanUserId, score: scoreRec.score, units: unitsForScore(scoreRec.score, program.rules) }))
      .filter((a) => a.units > 0) // zero-unit fans produce no journal noise
      .map((a) => {
        const entry = { id: nextId("led"), programId, debitAccountId: SYSTEM_ACCOUNT, creditAccountId: a.fanUserId, units: a.units, reason: `accrual:score=${a.score}`, createdAt: Date.now() };
        db.ledger.push(entry);
        return entry;
      });
    return reply.code(201).send({ ok: true, data: { entries, invariant: verifyLedger(db.ledger.filter((e) => e.programId === programId)) } });
  });

  /** Moat step 3: snapshot balances and distribute a revenue pool with exact-cent reconciliation. */
  app.post("/pools/:poolId/distribute", async (req, reply) => {
    const { poolId } = req.params as { poolId: string };
    const pool = db.pools.get(poolId);
    if (!pool) return reply.code(404).send({ ok: false, error: "pool_not_found" });
    const program = [...db.programs.values()].find((p) => p.creatorId === pool.creatorId && p.status === "active");
    if (!program) return reply.code(400).send({ ok: false, error: "no_active_program" });
    if (db.distributions.some((d) => d.revenuePoolId === poolId)) return reply.code(409).send({ ok: false, error: "pool_already_distributed" });

    const entries = db.ledger.filter((e) => e.programId === program.id);
    const balances = balancesFrom(entries);
    const weights = new Map([...balances.entries()].filter(([acct, bal]) => acct !== SYSTEM_ACCOUNT && bal > 0).map(([a, b]) => [a, b]));
    if (weights.size === 0) return reply.code(400).send({ ok: false, error: "no_unit_holders_accrue_first" });

    const payouts = proRata(pool.distributableCents, weights);
    const totalUnits = [...weights.values()].reduce((a, b) => a + b, 0);
    const snapshot: Distribution[] = [...payouts.entries()].map(([fanUserId, payoutCents]) => ({
      id: nextId("dist"), revenuePoolId: poolId, fanUserId,
      units: weights.get(fanUserId)!,
      sharePercent: Number(((weights.get(fanUserId)! / totalUnits) * 100).toFixed(4)),
      payoutCents
    }));
    db.distributions.push(...snapshot);
    return reply.code(201).send({
      ok: true,
      data: {
        snapshot,
        reconciliation: {
          poolCents: pool.distributableCents,
          distributedCents: snapshot.reduce((sum, d) => sum + d.payoutCents, 0)
        }
      }
    });
  });

  app.get("/programs/:programId/ledger", async (req, reply) => {
    const { programId } = req.params as { programId: string };
    if (!db.programs.has(programId)) return reply.code(404).send({ ok: false, error: "program_not_found" });
    const entries = db.ledger.filter((e) => e.programId === programId);
    return { ok: true, data: { entries, balances: Object.fromEntries(balancesFrom(entries)), invariant: verifyLedger(entries) } };
  });
}
