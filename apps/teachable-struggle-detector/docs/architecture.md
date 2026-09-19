# Architecture — Student Struggle Detector

## Production target (blueprint §5)
- Next.js learner app + custom player (Mux/Video.js/Cloudflare Stream)
- FastAPI/NestJS course APIs; Python analytics service; PostgreSQL core, ClickHouse for
  high-volume playback telemetry, Redis session state, S3 assets
- Kafka playback events; Airflow/Temporal nightly analytics; sklearn/XGBoost scoring; LLM
  clarification-card drafting

## This scaffold
- Fastify + TypeScript, in-memory, deterministic weighted scoring (no ML dependency yet)
- Analysis runs on-demand (`POST /lessons/:id/analyze`); production runs it as a daily job
  per lesson over the telemetry warehouse
- Privacy stance carries forward: dashboards aggregate by cohort; minimize student PII in
  analytics payloads (FERPA-like caution from the blueprint)
