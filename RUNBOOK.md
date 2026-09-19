# Runbook

## Prerequisites
- Node.js 20+
- pnpm 9+
- Docker (optional for local Postgres/Redis and full portfolio stack)

## Local infrastructure only
```bash
cd killer-suite/infrastructure
docker compose up -d
```

## Full portfolio stack via Docker
```bash
cd killer-suite/infrastructure
docker compose -f docker-compose.portfolio.yml up -d --build
```

This starts:
- Postgres
- Redis
- all 10 app containers on ports `4001` through `4010`

## Install workspace dependencies
```bash
cd killer-suite
pnpm install
```

## Run any app directly from the monorepo
Examples:
```bash
pnpm dev:calendly
pnpm dev:notion
pnpm dev:shopify
pnpm dev:linkedin
```

## Shared packages
- `packages/contracts`
- `packages/config`
- `packages/auth`
- `packages/observability`

## Demo files
Open the HTML previews directly from the workspace:
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

## Portfolio blueprint pack
Read:
- `10_disruptor_blueprints.md`
- `docs/portfolio_catalog.md`
- `docs/launch_checklist.md`
- `docs/monorepo_architecture.md`
- `docs/deployment_targets.md`
