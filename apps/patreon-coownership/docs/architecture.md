# Architecture — Creator Co-Ownership

## Production target (blueprint §3)
- TypeScript/NestJS or Go (ledger correctness), PostgreSQL core + append-only double-entry
  ledger tables, S3 media, Redis cache
- Kafka for engagement/purchases/accruals; Python scoring service; Stripe Connect + Tipalti/Trolley payouts
- Optional on-chain mirror of the rights ledger (MVP stays off-chain for compliance simplicity)

## This scaffold
- Fastify + TypeScript, in-memory; ledger math is a pure module (`src/lib/ownership.ts`)
- Productionization: persist append-only entries with DB constraints, move scoring to a
  scheduled job, wrap distributions in a transaction with reconciliation tests
