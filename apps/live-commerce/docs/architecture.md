# Architecture — Live Social Proof Commerce

## Production target (blueprint §1)
- Next.js storefront + builder; Fastify commerce APIs; Go realtime service for stream state/fanout
- PostgreSQL (catalog/orders), Redis (cart/session cache), ClickHouse (visitor events), S3 (media)
- Kafka/Redpanda event streaming; LiveKit/Agora video; Stripe payments

## This scaffold
- Fastify + TypeScript, in-memory stores swapped later for Prisma repositories
- Social proof engine and buy-now token logic are pure modules (`src/lib/`) for testability
- Migration path: events → Kafka → ClickHouse; proof engine becomes a stream processor;
  realtime payloads move to a WebSocket gateway
