# Architecture — Serendipity Matchmaking

## Production target (blueprint §9)
- Next.js organizer UI + attendee app; Go/NestJS ticketing + check-in; Python graph matching
- PostgreSQL core, Neo4j/pgvector attendee graph, Redis check-in + ephemeral signaling,
  PostGIS venue geofencing; Kafka for registrations/check-ins/proximity
- BLE + geofenced zones for proximity (coarse zones, not continuous location — deliberate
  privacy choice)

## This scaffold
- Fastify + TypeScript, in-memory; lexical scoring stands in for embeddings
  (same contract: pair score + rationale → top-N → gated signaling)
- The opt-in/rank/zone signal gate is the production state machine; harassment controls
  (one-way signal until accepted, decline) are already in the flow
