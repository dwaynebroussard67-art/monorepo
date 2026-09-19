# Runbook

All commands run from the **repository root** (whatever the cloned folder is named).

## Prerequisites
- Node.js 20+
- pnpm 9+ (`corepack enable && corepack prepare pnpm@9.15.9 --activate`)
- Docker (optional: local Postgres/Redis, portfolio stack, container builds)

## Install workspace dependencies
```bash
pnpm install          # or: make install
```

## Verify everything
```bash
pnpm typecheck        # typecheck all 14 workspaces via turbo (or: make typecheck)
pnpm test:smoke       # boot all 10 app servers in-process; 70 behavior checks (make smoke)
```

## Run any app directly
```bash
pnpm dev:shopify      # live-commerce            → :4001
pnpm dev:calendly     # calendly-meeting-intel   → :4002
pnpm dev:patreon      # patreon-coownership      → :4003
pnpm dev:notion       # notion-living-docs       → :4004
pnpm dev:teachable    # teachable-struggle-detector → :4005
pnpm dev:opentable    # opentable-taste-passport → :4006
pnpm dev:fiverr       # fiverr-squad-bidding     → :4007
pnpm dev:mailchimp    # mailchimp-send-time      → :4008
pnpm dev:eventbrite   # eventbrite-matchmaking   → :4009
pnpm dev:linkedin     # linkedin-proof-of-work   → :4010
```
Every app answers `GET /health` with `{ ok, service, version }`.

## Local infrastructure only (Postgres + Redis)
```bash
cd infrastructure && docker compose up -d     # or: make infra-up
```

## Full portfolio stack via Docker
```bash
cd infrastructure && docker compose -f docker-compose.portfolio.yml up -d --build   # make portfolio-up
```
Starts Postgres, Redis, and all 10 app containers on ports `4001`–`4010`.
(App Dockerfiles build from the **repo-root context** because of workspace packages.)

## Demo files (open directly in a browser)
- `apps/live-commerce/frontend/store-demo.html`
- `apps/calendly-meeting-intel/frontend/booking-demo.html`
- `apps/notion-living-docs/frontend/workspace-demo.html`
- `apps/patreon-coownership/frontend/demo.html`
- `apps/teachable-struggle-detector/frontend/demo.html`
- `apps/opentable-taste-passport/frontend/demo.html`
- `apps/fiverr-squad-bidding/frontend/demo.html`
- `apps/mailchimp-send-time/frontend/demo.html`
- `apps/eventbrite-matchmaking/frontend/demo.html`
- `apps/linkedin-proof-of-work/frontend/demo.html`
- Portfolio overview: `preview/index.html`

Each app also has a scripted cURL walkthrough in `apps/<app>/docs/demo-flow.md`.

## Shared packages
- `packages/contracts` — shared API/domain contract types
- `packages/config` — zod env parsing (`parseEnv`)
- `packages/auth` — session/RBAC utilities
- `packages/observability` — structured logging + request ids

## Build a distributable archive
```bash
make zip              # <foldername>-complete.zip + sha256, in the repo root
```

## Blueprint & planning docs
- `10_disruptor_blueprints.md` · `MASTER_CODE_SCHEMATICS.md` · `STATUS.md`
- `docs/portfolio_catalog.md` · `docs/launch_checklist.md`
- `docs/monorepo_architecture.md` · `docs/deployment_targets.md` · `docs/build_order.md`
