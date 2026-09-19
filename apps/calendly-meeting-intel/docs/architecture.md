# Architecture — Meeting Intelligence Scheduler

## Production target (blueprint §2)
- Next.js booking pages/dashboard; Fastify API; Temporal for long-running MeetingIntelWorkflow
- PostgreSQL + pgvector (embeddings), Redis; Kafka for booking lifecycle events
- Google Calendar / Microsoft Graph / Zoom / HubSpot / Salesforce adapters
- Python summarization/enrichment service (LangChain/LlamaIndex + spaCy)

## This scaffold
- Fastify + TypeScript, in-memory stores; slot math in UTC (production keeps user timezones)
- The moat pipeline runs synchronously on booking for demoability; production splits it into
  Temporal activities with retries: enrich -> brief -> reminders -> wait(transcript) -> summarize -> sync
- Sync idempotency design (deterministic keys) carries directly over
