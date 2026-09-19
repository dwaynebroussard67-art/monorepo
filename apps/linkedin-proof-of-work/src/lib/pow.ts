/**
 * Moat: Proof-of-Work profiles.
 * Skills are DERIVED from verified artifacts, never typed in as truth:
 * artifact -> verification checks -> claim extraction -> evidence graph -> recruiter view.
 *
 * Verification here uses real sha256 challenge/response for live endpoints, author
 * tokens for writing, structural signature checks for commits, and domain-bound
 * attestation digests for client proof. Rejected artifacts are kept with their failed
 * checks for auditability (dispute-friendly by design).
 */
import { createHash, randomBytes } from "node:crypto";
import type { ArtifactType, VerificationCheck } from "./store.js";

export const sha256 = (input: string): string => createHash("sha256").update(input).digest("hex");

export const CHALLENGE_TTL_MS = 30 * 60_000;
export function newNonce(): string {
  return randomBytes(16).toString("hex");
}
/** What a live endpoint must return to prove control of `domain` for `nonce`. */
export function expectedChallengeResponse(nonce: string, domain: string): string {
  return sha256(`${nonce}:${domain}`);
}
/** Author token someone places in their published writing to prove authorship. */
export function authorTokenFor(profileId: string): string {
  return sha256(`author:${profileId}`);
}
/** Deterministic domain-bound digest standing in for a signed client attestation. */
export function expectedAttestationDigest(clientDomain: string, clientEmail: string, projectRef: string): string {
  return sha256(`${clientDomain}:${clientEmail}:${projectRef}`);
}

export function verifyArtifact(
  type: ArtifactType,
  payload: Record<string, unknown>,
  ctx: { profileId: string; challenge?: { nonce: string; expiresAt: number }; now?: number }
): { status: "verified" | "rejected"; checks: VerificationCheck[] } {
  const now = ctx.now ?? Date.now();
  let checks: VerificationCheck[] = [];

  if (type === "github_commit") {
    const sha = String(payload.sha ?? "");
    checks = [
      { name: "sha_shape", passed: /^[0-9a-f]{40}$/.test(sha), detail: "commit sha must be 40 lowercase hex chars" },
      { name: "repo_present", passed: typeof payload.repo === "string" && payload.repo.length > 0, detail: "repo identifier required" },
      { name: "signature_verified", passed: payload.signatureVerified === true, detail: "provider-attested commit signature must be present" },
      { name: "author_matches_account", passed: payload.authorMatchesAccount === true, detail: "commit author must match the claimed account" }
    ];
  } else if (type === "live_api") {
    const domain = String(payload.domain ?? "");
    const response = String(payload.response ?? "");
    const challengeValid = !!ctx.challenge && ctx.challenge.expiresAt > now;
    checks = [
      { name: "challenge_issued", passed: !!ctx.challenge, detail: "request a challenge for this domain first (POST /profiles/:id/challenges)" },
      { name: "challenge_fresh", passed: challengeValid, detail: "challenge must be unexpired (30m TTL)" },
      { name: "challenge_response", passed: challengeValid && response === expectedChallengeResponse(ctx.challenge!.nonce, domain), detail: "endpoint must return sha256(nonce:domain)" }
    ];
  } else if (type === "published_writing") {
    const contentSnippet = String(payload.contentSnippet ?? "");
    checks = [
      { name: "url_present", passed: typeof payload.url === "string" && payload.url.startsWith("http"), detail: "canonical URL required" },
      { name: "author_token", passed: contentSnippet.includes(authorTokenFor(ctx.profileId)), detail: "page must contain the profile's author token" }
    ];
  } else if (type === "client_attestation") {
    const clientDomain = String(payload.clientDomain ?? "");
    const clientEmail = String(payload.clientEmail ?? "");
    const projectRef = String(payload.projectRef ?? "");
    const signedBlob = String(payload.signedBlob ?? "");
    checks = [
      { name: "email_domain_matches", passed: clientEmail.endsWith(`@${clientDomain}`) && clientDomain.includes("."), detail: "attesting email must live at the client domain" },
      { name: "attestation_digest", passed: signedBlob === expectedAttestationDigest(clientDomain, clientEmail, projectRef), detail: "signed blob must equal sha256(clientDomain:clientEmail:projectRef)" }
    ];
  }

  return { status: checks.length > 0 && checks.every((c) => c.passed) ? "verified" : "rejected", checks };
}

export const SKILL_ONTOLOGY = [
  "typescript", "javascript", "react", "node", "go", "rust", "python", "java",
  "postgres", "redis", "kafka", "kubernetes", "aws", "gcp", "graphql", "terraform",
  "ml", "llm", "design", "css", "stripe", "fastify"
] as const;

export interface ExtractedClaim { claimType: "skill" | "outcome" | "scale"; value: string; confidence: number }

export function extractClaims(text: string): ExtractedClaim[] {
  const lower = text.toLowerCase();
  const claims: ExtractedClaim[] = [];
  for (const skill of SKILL_ONTOLOGY) {
    if (new RegExp(`\\b${skill}\\b`).test(lower)) claims.push({ claimType: "skill", value: skill, confidence: 0.8 });
  }
  const outcomes = new Set<string>();
  // noun-first order: "a 38% increase", "20% reduction"
  for (const m of lower.matchAll(/(\d+(?:\.\d+)?)%\s*(increase|decrease|growth|reduction|improvement)/g)) {
    outcomes.add(`${m[1]}% ${m[2]}`);
  }
  // verb-first order: "increasing throughput by 38%", "reduced latency by 20%"
  for (const m of lower.matchAll(/(increas\w+|grew|improv\w+|decreas\w+|reduc\w+)[^.]{0,40}?\sby\s(\d+(?:\.\d+)?)%/g)) {
    const direction = /^(increas|grew|improv)/.test(m[1]!) ? "increase" : "decrease";
    outcomes.add(`${m[2]}% ${direction}`);
  }
  for (const value of outcomes) claims.push({ claimType: "outcome", value, confidence: 0.85 });
  for (const m of lower.matchAll(/(\d[\d,.]*)\s*(k|m)?\s*(users|requests|records|events|qps)/g)) {
    const mult = m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1;
    claims.push({ claimType: "scale", value: `${parseFloat(m[1]!.replace(/,/g, "")) * mult} ${m[3]}`, confidence: 0.75 });
  }
  return claims;
}

/** Evidence score per skill: strongest verified claim source wins; unverified = 0. */
export function skillEvidenceScores(claimsByArtifact: Array<{ artifactId: string; verified: boolean; claims: ExtractedClaim[] }>): Map<string, { score: number; artifactId: string }> {
  const out = new Map<string, { score: number; artifactId: string }>();
  const outcomes = new Map<string, number>();
  for (const { artifactId, verified, claims } of claimsByArtifact) {
    if (!verified) continue;
    outcomes.set(artifactId, claims.filter((c) => c.claimType !== "skill").length);
    for (const claim of claims.filter((c) => c.claimType === "skill")) {
      const boost = 1 + 0.1 * Math.min(3, outcomes.get(artifactId) ?? 0); // artifacts with outcomes/scale boost the skill evidence
      const score = Math.min(1, claim.confidence * boost);
      const current = out.get(claim.value);
      if (!current || score > current.score) out.set(claim.value, { score: Number(score.toFixed(2)), artifactId });
    }
  }
  return out;
}

export function credibilityScore(skillScores: Map<string, { score: number }>): number {
  const top = [...skillScores.values()].map((s) => s.score).sort((a, b) => b - a).slice(0, 5);
  if (top.length === 0) return 0;
  return Math.round((top.reduce((a, b) => a + b, 0) / top.length) * 100);
}
