# Live Social Proof Commerce (`live-commerce`)

Disruptor #1 — the Shopify killer: storefront + catalog + checkout fused with a
**confidence-scored social proof engine** and **live-stream shopping with embedded buy-now**.

## The moat
Anonymous storefront events (views, add-to-carts, purchases) are aggregated over sliding
windows (5m viewers / 15m cart adds / 1h purchases / 24h uniques). Merchant rules +
a confidence model (bot-ratio, density, viewer-uniqueness) decide which proof messages are
safe to publish to widgets and stream overlays. Host product pins sync to viewers and a
single-use, 15-minute `buy_now_token` opens express checkout without redirect loops.

## Module map (per MASTER_CODE_SCHEMATICS)
- Entrypoint: `src/server.ts` — port **4001**
- `src/modules/store/routes.ts` — stores, products, signed-event ingestion, proof feed
- `src/modules/cart/routes.ts` — carts, guarded checkout (server-side pricing, inventory checks)
- `src/modules/streams/routes.ts` — live streams, pin, buy-now token lifecycle
- `src/lib/social-proof.ts` — aggregation windows, confidence scoring, message rendering, token state machine
- `src/lib/store.ts` — in-memory store + deterministic demo seed

## Run
```bash
pnpm dev:shopify            # from repo root (tsx watch)
curl localhost:4001/health
```

## Demo
- `frontend/store-demo.html` — visual preview
- `docs/demo-flow.md` — scripted API walkthrough
- `docs/architecture.md` — production architecture direction
- `openapi.yaml` — API stub · `prisma/schema.prisma` — data model stub
