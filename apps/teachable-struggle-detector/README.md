# Student Struggle Detector (`teachable-struggle-detector`)

Disruptor #5 — the Teachable killer: course delivery fused with **playback telemetry +
quiz-failure clustering** that pinpoints exactly where learners break down.

## The moat
Playback events are bucketed every 10 seconds along the lesson timeline. Each bucket gets
a weighted struggle score from micro-rewinds into the bucket, pause clusters, replay rate,
dropoff delta vs. the lesson baseline, and the fail rate of quiz questions whose concept
tags map to that video window. Buckets over threshold become instructor alerts **with
evidence breakdowns**, and the worst bucket drafts a clarification card — **inactive until
an instructor approves it** (blueprint compliance: instructor approval is the default).

## Module map (per MASTER_CODE_SCHEMATICS)
- Entrypoint: `src/server.ts` — port **4005**
- `src/modules/core/routes.ts` — telemetry ingestion, quiz attempts, analysis, alerts, cards
- `src/lib/struggle.ts` — bucketing, signal densities, scoring, remediation drafting
- `src/lib/store.ts` — in-memory store + deterministic demo telemetry

## Run
```bash
pnpm dev:teachable
curl localhost:4005/health
```

## Demo
- `frontend/demo.html` — visual preview (timeline heatmap framing)
- `docs/demo-flow.md` — scripted walkthrough
