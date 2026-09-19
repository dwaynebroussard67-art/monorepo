# Serendipity Matchmaking (`eventbrite-matchmaking`)

Disruptor #9 — the Eventbrite killer: ticketing fused with **pre-event match ranking and
live, zone-gated signal-to-connect**.

## The moat
Opted-in attendee profiles are scored pairwise: interest similarity (Jaccard) plus **goal
complementarity** (hiring ↔ job seeking, fundraising ↔ deal flow, mentoring ↔ seeking
mentor…), minus duplicate-context penalties (same company/role), with **prior connections
suppressed entirely**. Each attendee receives a diversity-constrained Top-5 brief (at most
one match per company). At the venue, signaling is only possible if both sides opted in,
the pair appears in the signaler's ranked list, and both are inside an authorized venue
zone — accepted signals mint connections; everything else is a 403.

## Module map (per MASTER_CODE_SCHEMATICS)
- Entrypoint: `src/server.ts` — port **4009**
- `src/modules/core/routes.ts` — events, attendees, match generation, signals, connections
- `src/lib/matchmaking.ts` — pair scoring, Top-N with diversity, signal gating
- `src/lib/store.ts` — in-memory store + demo event with complementary pairs

## Run
```bash
pnpm dev:eventbrite
curl localhost:4009/health
```
Demo: `docs/demo-flow.md` · preview: `frontend/demo.html`
