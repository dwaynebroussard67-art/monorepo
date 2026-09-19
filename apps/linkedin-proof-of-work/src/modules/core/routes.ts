import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, nextId, type Artifact } from "../../lib/store.js";
import {
  CHALLENGE_TTL_MS, credibilityScore, extractClaims, newNonce,
  skillEvidenceScores, verifyArtifact
} from "../../lib/pow.js";

const challengeSchema = z.object({ domain: z.string().min(4).max(253).regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "hostname expected") });
const artifactSchema = z.object({
  artifactType: z.enum(["github_commit", "live_api", "published_writing", "client_attestation"]),
  text: z.string().min(1).max(50_000),
  payload: z.record(z.unknown()).default({})
});

function refreshEvidence(profileId: string): void {
  db.evidence = db.evidence.filter((e) => e.profileId !== profileId);
  const artifacts = [...db.artifacts.values()].filter((a) => a.profileId === profileId);
  const scores = skillEvidenceScores(artifacts.map((a) => ({
    artifactId: a.id,
    verified: a.verificationStatus === "verified",
    claims: [...db.claims.values()].filter((c) => c.artifactId === a.id)
  })));
  for (const [skill, { score, artifactId }] of scores) db.evidence.push({ profileId, skill, artifactId, evidenceScore: score });
}

export async function coreRoutes(app: FastifyInstance) {
  app.post("/profiles", async (req, reply) => {
    const schema = z.object({ name: z.string().min(1), headline: z.string().default(""), selfDeclaredSkills: z.array(z.string()).default([]) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const profile = { id: nextId("prof"), ...parsed.data };
    db.profiles.set(profile.id, profile);
    return reply.code(201).send({ ok: true, data: profile });
  });

  /** Issue a live-domain verification challenge (30m TTL). */
  app.post("/profiles/:profileId/challenges", async (req, reply) => {
    const { profileId } = req.params as { profileId: string };
    if (!db.profiles.has(profileId)) return reply.code(404).send({ ok: false, error: "profile_not_found" });
    const parsed = challengeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const challenge = { id: nextId("chal"), profileId, domain: parsed.data.domain.toLowerCase(), nonce: newNonce(), expiresAt: Date.now() + CHALLENGE_TTL_MS };
    db.challenges.set(`${profileId}:${challenge.domain}`, challenge);
    return reply.code(201).send({ ok: true, data: { domain: challenge.domain, nonce: challenge.nonce, expiresAt: challenge.expiresAt, hint: "respond with sha256(`${nonce}:${domain}`) as the live_api payload.response" } });
  });

  /** Moat: artifact submission -> verification -> claim extraction -> evidence graph. */
  app.post("/profiles/:profileId/artifacts", async (req, reply) => {
    const { profileId } = req.params as { profileId: string };
    if (!db.profiles.has(profileId)) return reply.code(404).send({ ok: false, error: "profile_not_found" });
    const parsed = artifactSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });

    const domain = typeof parsed.data.payload.domain === "string" ? parsed.data.payload.domain.toLowerCase() : undefined;
    const challenge = domain ? db.challenges.get(`${profileId}:${domain}`) : undefined;
    const { status, checks } = verifyArtifact(parsed.data.artifactType, parsed.data.payload, { profileId, challenge });

    const artifact: Artifact = {
      id: nextId("art"), profileId, artifactType: parsed.data.artifactType,
      verificationStatus: status, checks, text: parsed.data.text,
      metadata: parsed.data.payload, createdAt: Date.now()
    };
    db.artifacts.set(artifact.id, artifact);

    // Claims are extracted ONLY from verified artifacts.
    const claims = status === "verified"
      ? extractClaims(parsed.data.text).map((c) => ({ id: nextId("claim"), artifactId: artifact.id, ...c }))
      : [];
    for (const claim of claims) db.claims.set(claim.id, claim);
    refreshEvidence(profileId);

    return reply.code(201).send({ ok: true, data: { artifact, claims } });
  });

  app.get("/profiles/:profileId/evidence-graph", async (req, reply) => {
    const { profileId } = req.params as { profileId: string };
    if (!db.profiles.has(profileId)) return reply.code(404).send({ ok: false, error: "profile_not_found" });
    const artifacts = [...db.artifacts.values()].filter((a) => a.profileId === profileId);
    const claims = [...db.claims.values()].filter((c) => artifacts.some((a) => a.id === c.artifactId));
    const evidence = db.evidence.filter((e) => e.profileId === profileId);
    return { ok: true, data: { artifacts, claims, evidence, credibility: credibilityScore(new Map(evidence.map((e) => [e.skill, { score: e.evidenceScore }]))) } };
  });

  /** Recruiter view: only evidence-backed skills, ranked; self-declared skills are visibly quarantined. */
  app.get("/profiles/:profileId/recruiter-view", async (req, reply) => {
    const { profileId } = req.params as { profileId: string };
    const profile = db.profiles.get(profileId);
    if (!profile) return reply.code(404).send({ ok: false, error: "profile_not_found" });
    const evidence = db.evidence.filter((e) => e.profileId === profileId).sort((a, b) => b.evidenceScore - a.evidenceScore);
    const evidenceSkills = new Set(evidence.map((e) => e.skill));
    return {
      ok: true,
      data: {
        name: profile.name, headline: profile.headline,
        credibility: credibilityScore(new Map(evidence.map((e) => [e.skill, { score: e.evidenceScore }]))),
        evidenceBackedSkills: evidence.map((e) => ({
          skill: e.skill, evidenceScore: e.evidenceScore,
          sourceArtifactId: e.artifactId,
          outcomes: [...db.claims.values()].filter((c) => c.artifactId === e.artifactId && c.claimType !== "skill").map((c) => c.value)
        })),
        unverifiedSelfDeclared: profile.selfDeclaredSkills.filter((s) => !evidenceSkills.has(s.toLowerCase())),
        note: "Self-declared skills without verified artifacts are down-ranked/hidden by policy."
      }
    };
  });
}
