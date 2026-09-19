# Meeting Intelligence Scheduler (`calendly-meeting-intel`)

Disruptor #2 — the Calendly killer: booking links + availability fused with a
**booking-triggered intelligence pipeline** — dual-sided pre-briefs, transcript summaries,
action-item extraction, and idempotent calendar/CRM writeback.

## The moat
A confirmed booking kicks off the full pipeline: participants are enriched, signals are
deduped and confidence-ranked, and two role-specific briefs (host + invitee) are written.
After the meeting, the transcript is summarized into decisions and structured action items
(with confidence + review flags, per compliance guidance) and synced back into calendar
extended properties and CRM notes with deterministic idempotency keys so retries never
double-write.

## Module map (per MASTER_CODE_SCHEMATICS)
- Entrypoint: `src/server.ts` — port **4002**
- `src/modules/availability/routes.ts` — public slot surface
- `src/modules/bookings/routes.ts` — booking lifecycle, briefs, transcripts
- `src/modules/integrations/routes.ts` — calendar/CRM sync (idempotent)
- `src/modules/reminders/service.ts` — 24h/1h reminder planning
- `src/lib/meeting-intelligence.ts` — slots, briefs, summary extraction, sync keys
- `src/lib/store.ts` — in-memory store + demo enrichment seed

## Run
```bash
pnpm dev:calendly
curl localhost:4002/health
```

## Demo
- `frontend/booking-demo.html` — visual preview
- `docs/demo-flow.md` — scripted API walkthrough
- `openapi.yaml` · `prisma/schema.prisma` — stubs
