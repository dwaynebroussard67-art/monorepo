# Taste Profile Passport (`opentable-taste-passport`)

Disruptor #6 — the OpenTable killer: reservations fused with a **portable, consent-scoped
taste passport** that produces pre-arrival hospitality briefs.

## The moat
Diners keep a structured preference vector (dietary flags, allergies, flavor axes, service
prefs) with a **reservation-scoped consent policy**. On confirmation, the server derives
only the granted traits — including inference like *“low-sodium preference inferred from
last 3 visits”* — and renders a concise host brief. The host consoles redeem it through a
**single-use token** that only becomes readable 30 minutes before seating and expires at
start time. The restaurant sees a derived brief, never the raw visit history.

Honest boundary: this scaffold models the consent/derivation/token layer. The blueprint's
HPKE zero-knowledge encryption is a production step and is deliberately not claimed here.

## Module map (per MASTER_CODE_SCHEMATICS)
- Entrypoint: `src/server.ts` — port **4006**
- `src/modules/core/routes.ts` — passport, reservations, confirm → brief token, host redeem
- `src/lib/passport.ts` — consent-limited trait derivation, brief rendering, token window
- `src/lib/store.ts` — in-memory store

## Run
```bash
pnpm dev:opentable
curl localhost:4006/health
```
Demo: `docs/demo-flow.md` · preview: `frontend/demo.html`
