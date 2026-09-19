/** In-memory data store. Production target: PostgreSQL + graph DB + S3 artifact cache (see prisma/schema.prisma). */

export interface Profile { id: string; name: string; headline: string; selfDeclaredSkills: string[] }
export type ArtifactType = "github_commit" | "live_api" | "published_writing" | "client_attestation";
export interface VerificationCheck { name: string; passed: boolean; detail: string }
export interface Artifact {
  id: string; profileId: string; artifactType: ArtifactType;
  verificationStatus: "verified" | "rejected"; checks: VerificationCheck[];
  text: string; metadata: Record<string, unknown>; createdAt: number;
}
export interface Claim { id: string; artifactId: string; claimType: "skill" | "outcome" | "scale"; value: string; confidence: number }
export interface SkillEvidence { profileId: string; skill: string; artifactId: string; evidenceScore: number }
export interface Challenge { id: string; profileId: string; domain: string; nonce: string; expiresAt: number }

export const db = {
  profiles: new Map<string, Profile>(),
  artifacts: new Map<string, Artifact>(),
  claims: new Map<string, Claim>(),
  evidence: [] as SkillEvidence[],
  challenges: new Map<string, Challenge>() // key: profileId:domain
};

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
}

let seeded = false;
export function seed() {
  if (seeded) return;
  seeded = true;
  db.profiles.set("prof_dana", {
    id: "prof_dana", name: "Dana Osei", headline: "Staff engineer — platform & payments",
    selfDeclaredSkills: ["typescript", "rust", "design"] // design has no artifact: it must NOT appear as evidence-backed
  });
}
