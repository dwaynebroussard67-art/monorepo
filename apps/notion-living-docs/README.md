# Living Document Workspace (`notion-living-docs`)

Disruptor #4 — the Notion killer: docs + page graph fused with a **living document engine**
that treats knowledge integrity as a stateful alerting problem.

## The moat
Every new page version is parsed into machine-comparable **assertions**. The audit engine
pairs assertions, scores contradictions (numeric conflicts and polarity flips on shared
subject matter), scans for stale pages and dormant actions, and writes **stateful alert
records** with evidence spans — never ephemeral AI comments. A workspace health score is
derived from unresolved integrity signals. Alerts upsert by dedupe key, so re-auditing is
safe. Editing a page re-extracts assertions and re-runs the audit automatically.

## Module map (per MASTER_CODE_SCHEMATICS)
- Entrypoint: `src/server.ts` — port **4004**
- `src/modules/workspaces/routes.ts` — workspaces, pages, versions, actions, audit, alerts
- `src/modules/links/routes.ts` — explicit links + graph view (incl. contradiction edges)
- `src/modules/living-docs/engine.ts` — the audit engine
- `src/lib/assertions.ts` — extraction, contradiction scoring, staleness, health score
- `src/lib/store.ts` — in-memory store + seeded contradiction/stale/dormant demo

## Run
```bash
pnpm dev:notion
curl localhost:4004/health
```

## Demo
- `frontend/workspace-demo.html` — visual preview
- `docs/demo-flow.md` — scripted walkthrough (fix a contradiction by editing a page)
