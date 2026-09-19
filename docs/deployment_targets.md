# Deployment Targets

## Local portfolio stack
Use `infrastructure/docker-compose.portfolio.yml` to run Postgres, Redis, and all 10 app containers.

## Recommended production targets
- API services: Fly.io / Railway / ECS / Cloud Run
- Postgres: Neon / RDS / Cloud SQL
- Redis: Upstash / Elasticache / Memorystore
- Event streams: Redpanda Cloud / Confluent
- Object storage: S3 / R2 / GCS
- Edge frontend: Vercel / Netlify / Cloudflare
