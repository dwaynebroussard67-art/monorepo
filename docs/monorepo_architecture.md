# Monorepo Architecture

## Layout
- `apps/` -> product services
- `packages/` -> shared contracts, config, auth, observability
- `docs/` -> blueprint and launch docs
- `infrastructure/` -> local and portfolio compose stacks
- `.github/workflows/` -> CI

## Shared productionization direction
1. Move common auth/session middleware into `packages/auth`
2. Move environment parsing into `packages/config`
3. Move common response contracts into `packages/contracts`
4. Move structured logging/tracing helpers into `packages/observability`
