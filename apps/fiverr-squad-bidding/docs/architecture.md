# Architecture — Collaborative Bidding

## Production target (blueprint §7)
- Next.js client portal + freelancer console; Go/NestJS marketplace APIs; Yjs/CRDT
  collaborative proposal editing; PostgreSQL + skill-graph (Neo4j/pgvector); Kafka for
  proposal/milestone/payout events; Stripe Connect + escrow provider; signature service

## This scaffold
- Fastify + TypeScript, in-memory; proposals version per save (production: CRDT doc)
- Squad suggestion enumerates combinations ≤ 4 members over the candidate pool — fine for
  dozens of candidates; production swaps in skill-graph search with collaboration history
- Payout release is idempotent (409 on re-approval); production wraps it in a transaction
  with the escrow provider's idempotency keys
