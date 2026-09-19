# Creator Co-Ownership (`patreon-coownership`)

Disruptor #3 — the Patreon killer: memberships + gated content fused with a
**superfan scoring → immutable rights ledger → revenue distribution** pipeline.

## The moat
Engagement, tenure, spend, moderation and referrals (minus fraud penalties) roll up into a
superfan score. Scores accrue into participation units through an **append-only,
double-entry ledger** (auditable, clawbackable — not ad-hoc percentage fields). Revenue
pools are distributed pro-rata against a snapshot with **largest-remainder rounding**, so
distributed cents reconcile exactly to the pool.

⚠ Units model rev-share credits / loyalty participation, not equity (blueprint §3 — the
biggest regulatory risk in the portfolio; counsel required before true ownership claims).

## Module map (per MASTER_CODE_SCHEMATICS)
- Entrypoint: `src/server.ts` — port **4003**
- `src/modules/core/routes.ts` — engagement, scores, accrual, distribution, ledger
- `src/lib/ownership.ts` — scoring, ledger invariants, accrual, pro-rata math
- `src/lib/store.ts` — in-memory store + demo fans/pool

## Run
```bash
pnpm dev:patreon
curl localhost:4003/health
```

## Demo flow
1. POST /creators/creator_cora/scores/run — scores (ana ≫ ben ≫ cleo after fraud penalty)
2. POST /programs/prog_forge/accrue — ledger postings + invariant check
3. POST /pools/pool_october/distribute — snapshot; `reconciliation` shows exact-cent match
4. GET /programs/prog_forge/ledger — entries, balances, integrity
See `docs/demo-flow.md` for the full scripted walkthrough.
