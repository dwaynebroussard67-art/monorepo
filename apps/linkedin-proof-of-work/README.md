# Proof-of-Work Profile (`linkedin-proof-of-work`)

Disruptor #10 — the LinkedIn killer: a professional network where skills are **derived
from verified artifacts**, never typed in as truth.

## The moat
Every artifact runs a verification pipeline with per-type checks — sha-shape + signature +
author match for git commits, a **real sha256 nonce challenge** for live endpoints, an
author token for published writing, and a domain-bound attestation digest for client
proof. Only **verified** artifacts get claim extraction (skills, % outcomes, scale
indicators), which build an evidence graph: artifact → claims → skills → recruiter ranking.
Rejected artifacts are retained with their failed checks (dispute-friendly). The recruiter
view shows evidence-backed skills with confidence + outcomes and **visibly quarantines
self-declared skills** that have no proof.

## Module map (per MASTER_CODE_SCHEMATICS)
- Entrypoint: `src/server.ts` — port **4010**
- `src/modules/core/routes.ts` — profiles, challenges, artifact pipeline, evidence graph, recruiter view
- `src/lib/pow.ts` — verification checks, claim extraction, evidence scoring, credibility
- `src/lib/store.ts` — in-memory store

## Run
```bash
pnpm dev:linkedin
curl localhost:4010/health
```
Demo: `docs/demo-flow.md` · preview: `frontend/demo.html`
