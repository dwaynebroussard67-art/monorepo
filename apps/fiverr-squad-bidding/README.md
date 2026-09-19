# Collaborative Bidding (`fiverr-squad-bidding`)

Disruptor #7 — the Fiverr killer: a marketplace where freelancers assemble into **squads —
first-class contractable delivery units** — instead of bidding alone.

## The moat
Project scopes are parsed into skill vectors; squad suggestions must achieve **full skill
coverage**, then rank on rating, timezone spread and skill-overlap waste. Squads hold a
split matrix (must sum to 100%), co-author a versioned proposal, and convert acceptance
into a **unified contract with a single escrow**. Every milestone approval disburses into
the split table with largest-remainder rounding, so released cents always reconcile
exactly to the milestone.

## Module map (per MASTER_CODE_SCHEMATICS)
- Entrypoint: `src/server.ts` — port **4007**
- `src/modules/core/routes.ts` — projects, squads, proposals, contracts, milestone release
- `src/lib/squads.ts` — scope parsing, squad suggestions, split validation, payout math
- `src/lib/store.ts` — in-memory store + demo freelancers/project

## Run
```bash
pnpm dev:fiverr
curl localhost:4007/health
```
Demo: `docs/demo-flow.md` · preview: `frontend/demo.html`
