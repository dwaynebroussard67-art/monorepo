# Architecture — Send Time Personalization

## Production target (blueprint §8)
- Next.js campaign builder; Go high-throughput dispatch; Node admin APIs
- PostgreSQL core, ClickHouse telemetry, Redis queue scheduling, S3 templates
- Kafka for opens/clicks/bounces/provider webhooks; Python XGBoost/Bayesian survival models
- ESP abstraction over SES/Postmark/SendGrid/SparkPost

## This scaffold
- Fastify + TypeScript, in-memory; deterministic histogram model stands in for the ML
  service (same interface: histogram → constrained argmax → release queue)
- Queue reflow semantics are production-shaped; persistence moves to Redis sorted sets +
  sharded workers; timezone normalization moves to a tz database (DST-correct)
