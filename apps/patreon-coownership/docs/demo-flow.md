# Demo flow — patreon-coownership

Seeded: creator `creator_cora`, fans ana (12mo, $420 LTV), ben (6mo, $90), cleo (1mo, 5
referrals, 2 fraud flags). Program `prog_forge` (rev-share credits), pool `pool_october` ($10,000).

1. `curl localhost:4003/health`
2. `curl -XPOST localhost:4003/creators/creator_cora/scores/run`
   — ana tops the table; cleo's fraud penalty is visible in `factors`
3. `curl -XPOST localhost:4003/programs/prog_forge/accrue`
   — ledger entries per fan + `{ balanced: true, totalDebit == totalCredit }`
4. `curl -XPOST localhost:4003/pools/pool_october/distribute`
   — `reconciliation.distributedCents === reconciliation.poolCents` (exact-cent guarantee);
   second call → **409 pool_already_distributed**
5. `curl localhost:4003/programs/prog_forge/ledger` — full audit trail
6. Accrue without scores → **400 no_scores_run_scores_first** (ordering is enforced)
