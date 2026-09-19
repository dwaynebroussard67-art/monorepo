# Killer Suite

A multi-app venture studio workspace containing **10 disruptor SaaS product blueprints and code scaffolds**.

## Included products
1. **#1 Shopify killer** → `apps/live-commerce`
2. **#2 Calendly killer** → `apps/calendly-meeting-intel`
3. **#3 Patreon killer** → `apps/patreon-coownership`
4. **#4 Notion killer** → `apps/notion-living-docs`
5. **#5 Teachable killer** → `apps/teachable-struggle-detector`
6. **#6 OpenTable killer** → `apps/opentable-taste-passport`
7. **#7 Fiverr killer** → `apps/fiverr-squad-bidding`
8. **#8 Mailchimp killer** → `apps/mailchimp-send-time`
9. **#9 Eventbrite killer** → `apps/eventbrite-matchmaking`
10. **#10 LinkedIn killer** → `apps/linkedin-proof-of-work`

## What each app includes
- product README
- architecture notes
- demo flow document
- OpenAPI stub
- Prisma schema
- Fastify/TypeScript starter server
- core moat logic module(s)
- demo HTML preview
- `.env.example`
- app-level `Dockerfile`

## Shared monorepo packages
- `packages/contracts` -> shared API and domain contract types
- `packages/config` -> environment parsing helpers
- `packages/auth` -> auth/session/RBAC starter utilities
- `packages/observability` -> structured logging helpers

## Workspace-level deliverables
- `10_disruptor_blueprints.md` -> full technical blueprint pack for all 10
- `MASTER_CODE_SCHEMATICS.md` -> code/module schematics for all 10 apps
- `STATUS.md` -> current delivery status
- `RUNBOOK.md` -> local run instructions
- `DOWNLOADS.md` -> archive and single-folder inventory
- `SECURITY_BASELINE.md` -> shared control baseline
- `docs/portfolio_catalog.md` -> portfolio inventory
- `docs/launch_checklist.md` -> productionization checklist
- `docs/monorepo_architecture.md` -> shared architecture direction
- `docs/deployment_targets.md` -> deployment options
- `infrastructure/docker-compose.yml` -> local Postgres + Redis bootstrap
- `infrastructure/docker-compose.portfolio.yml` -> all-app local stack
- `preview/index.html` -> visual preview of the portfolio
- `.github/workflows/ci.yml` -> matrix typecheck pipeline scaffold

## Current state by app
- `live-commerce`: upgraded MVP scaffold for stores, products, carts, orders, event ingestion, social proof, streams, and buy-now flows
- `calendly-meeting-intel`: upgraded MVP scaffold for booking lifecycle, reminders, pre/post meeting intelligence, and sync flows
- `patreon-coownership`: creator membership + rights ledger + accrual/distribution scaffold
- `notion-living-docs`: upgraded MVP scaffold for pages, versions, alerts, graph links, and living-document audits
- `teachable-struggle-detector`: telemetry + quiz-clustering scaffold for struggle analysis and remediation prompts
- `opentable-taste-passport`: reservations + diner preference passport + pre-arrival brief scaffold
- `fiverr-squad-bidding`: squad formation + shared proposal + unified contract/payout scaffold
- `mailchimp-send-time`: subscriber engagement profile + personalized send-time scheduling scaffold
- `eventbrite-matchmaking`: attendee match ranking + live signal-to-connect scaffold
- `linkedin-proof-of-work`: artifact verification + claim extraction + evidence-backed profile scaffold

## Local workspace scripts
- `pnpm typecheck` — typecheck all 14 workspaces via turbo (also the CI job)
- `pnpm test:smoke` — boots all 10 app servers in-process and asserts 70 moat/edge behaviors (`scripts/smoke-apps.ts`)
- `pnpm dev:<product>` — run any app (see `RUNBOOK.md` for the port table)
- `make install | typecheck | smoke | infra-up | portfolio-up | zip` — convenience targets

## Important note
These are **serious MVP scaffolds and technical design packages**, not fully productionized shipped SaaS platforms. They are designed to accelerate execution, architecture, patent strategy discussion, and fundraising materials. Patentability notes are invention-framing guidance, **not legal advice**.
