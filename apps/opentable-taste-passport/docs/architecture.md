# Architecture — Taste Profile Passport

## Production target (blueprint §6)
- Next.js diner + restaurant apps, tablet-first host UI; Go/NestJS reservations; Python
  preference modeling; PostgreSQL+PostGIS, Redis availability cache, encrypted profile store
- HPKE/client-side encryption with KMS-managed key hierarchy for zero-knowledge reveals
- Kafka reservation events; scheduled brief workers

## This scaffold
- Fastify + TypeScript, in-memory; consent-scoped derivation and single-use brief tokens
  are implemented exactly as the production state machine will behave
- Allergy/dietary data is treated as sensitive: only derived traits cross the boundary and
  every brief read is logged/consumed (production: HPKE to the restaurant's public key)
