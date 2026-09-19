import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, nextId, type Contract, type Squad } from "../../lib/store.js";
import { generateContractTerms, parseScope, payoutSplits, suggestSquads, validateSplits } from "../../lib/squads.js";

const memberSchema = z.object({ freelancerId: z.string().min(1), roleTitle: z.string().min(1), splitPercent: z.number().int().min(1).max(100) });
const squadSchema = z.object({ leadFreelancerId: z.string().min(1), members: z.array(memberSchema).min(1).max(8) });
const proposalSchema = z.object({ content: z.string().min(1).max(100_000) });
const contractSchema = z.object({
  milestones: z.array(z.object({
    title: z.string().min(1), amountCents: z.number().int().positive(), ownerFreelancerId: z.string().min(1)
  })).min(1)
});

export async function coreRoutes(app: FastifyInstance) {
  app.get("/projects", async () => ({ ok: true as const, data: [...db.projects.values()] }));

  /** Moat: parse scope into a skill vector and suggest full-coverage squads. */
  app.get("/projects/:projectId/squad-suggestions", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = db.projects.get(projectId);
    if (!project) return reply.code(404).send({ ok: false, error: "project_not_found" });
    const required = parseScope(project.scope);
    const suggestions = suggestSquads(required, [...db.freelancers.values()]);
    return { ok: true, data: { requiredSkills: required, suggestions } };
  });

  app.post("/projects/:projectId/squads", async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = db.projects.get(projectId);
    if (!project) return reply.code(404).send({ ok: false, error: "project_not_found" });
    const parsed = squadSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    for (const m of parsed.data.members) {
      if (!db.freelancers.has(m.freelancerId)) return reply.code(404).send({ ok: false, error: "freelancer_not_found", details: { freelancerId: m.freelancerId } });
    }
    if (!parsed.data.members.some((m) => m.freelancerId === parsed.data.leadFreelancerId)) {
      return reply.code(400).send({ ok: false, error: "lead_must_be_a_member" });
    }
    const splits = validateSplits(parsed.data.members);
    if (!splits.ok) return reply.code(400).send({ ok: false, error: "invalid_splits", details: splits.error });
    const squad: Squad = { id: nextId("squad"), projectId, status: "forming", ...parsed.data };
    db.squads.set(squad.id, squad);
    db.proposals.set(squad.id, []);
    return reply.code(201).send({ ok: true, data: squad });
  });

  /** Shared proposal: versioned on every save (production: CRDT co-authoring). */
  app.post("/squads/:squadId/proposals", async (req, reply) => {
    const { squadId } = req.params as { squadId: string };
    const squad = db.squads.get(squadId);
    if (!squad) return reply.code(404).send({ ok: false, error: "squad_not_found" });
    const parsed = proposalSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const versions = db.proposals.get(squadId) ?? [];
    const version = { id: nextId("prop"), squadId, version: versions.length + 1, content: parsed.data.content, createdAt: Date.now() };
    versions.push(version);
    db.proposals.set(squadId, versions);
    squad.status = "proposed";
    return reply.code(201).send({ ok: true, data: version });
  });

  /** Client acceptance: unified contract from role matrix + milestone plan; single escrow opens. */
  app.post("/squads/:squadId/contract", async (req, reply) => {
    const { squadId } = req.params as { squadId: string };
    const squad = db.squads.get(squadId);
    if (!squad) return reply.code(404).send({ ok: false, error: "squad_not_found" });
    if ([...db.contracts.values()].some((c) => c.squadId === squadId)) return reply.code(409).send({ ok: false, error: "contract_exists" });
    const parsed = contractSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const project = db.projects.get(squad.projectId)!;
    const memberIds = new Set(squad.members.map((m) => m.freelancerId));
    for (const m of parsed.data.milestones) {
      if (!memberIds.has(m.ownerFreelancerId)) return reply.code(400).send({ ok: false, error: "milestone_owner_not_in_squad" });
    }
    let terms: unknown;
    try {
      terms = generateContractTerms(project, squad, parsed.data.milestones);
    } catch (err) {
      return reply.code(400).send({ ok: false, error: err instanceof Error ? err.message : "invalid_terms" });
    }
    const contract: Contract = { id: nextId("contract"), projectId: project.id, squadId, terms, escrowStatus: "open", createdAt: Date.now() };
    db.contracts.set(contract.id, contract);
    for (const m of parsed.data.milestones) {
      const milestone = { id: nextId("ms"), contractId: contract.id, status: "pending" as const, ...m };
      db.milestones.set(milestone.id, milestone);
    }
    squad.status = "contracted";
    project.status = "contracted";
    return reply.code(201).send({ ok: true, data: contract });
  });

  /** Milestone approval releases escrow into the split table (exact-cent, idempotent). */
  app.post("/milestones/:milestoneId/approve", async (req, reply) => {
    const { milestoneId } = req.params as { milestoneId: string };
    const milestone = db.milestones.get(milestoneId);
    if (!milestone) return reply.code(404).send({ ok: false, error: "milestone_not_found" });
    if (milestone.status === "approved") return reply.code(409).send({ ok: false, error: "milestone_already_approved" });
    const contract = db.contracts.get(milestone.contractId);
    if (!contract) return reply.code(404).send({ ok: false, error: "contract_not_found" });
    const squad = db.squads.get(contract.squadId)!;

    milestone.status = "approved";
    const splits = payoutSplits(milestone.amountCents, squad.members);
    const released = [...splits.entries()].map(([freelancerId, amountCents]) => {
      const payout = { id: nextId("pay"), contractId: contract.id, milestoneId: milestone.id, freelancerId, amountCents, status: "released" as const };
      db.payouts.push(payout);
      return payout;
    });
    const pending = [...db.milestones.values()].filter((m) => m.contractId === contract.id && m.status === "pending").length;
    contract.escrowStatus = pending === 0 ? "released" : "partially_released";
    return {
      ok: true,
      data: {
        milestone, payouts: released,
        reconciliation: { milestoneCents: milestone.amountCents, releasedCents: released.reduce((sum, p) => sum + p.amountCents, 0) }
      }
    };
  });

  app.get("/contracts/:contractId", async (req, reply) => {
    const { contractId } = req.params as { contractId: string };
    const contract = db.contracts.get(contractId);
    if (!contract) return reply.code(404).send({ ok: false, error: "contract_not_found" });
    const milestones = [...db.milestones.values()].filter((m) => m.contractId === contractId);
    const payouts = db.payouts.filter((p) => p.contractId === contractId);
    return { ok: true, data: { contract, milestones, payouts } };
  });
}
