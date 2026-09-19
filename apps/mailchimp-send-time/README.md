# Send Time Personalization (`mailchimp-send-time`)

Disruptor #8 — the Mailchimp killer: campaigns fused with a **per-subscriber, minute-level
send-time engine** and a throughput-aware dynamic dispatch queue.

## The moat
Every open/click lands in the subscriber's local minute-of-week histogram (10-minute
buckets, clicks weighted 2×, exponential recency decay). Cold subscribers fall back through
**subscriber → segment → timezone → global** cohorts. Launching a campaign schedules each
recipient at their argmax slot *inside the campaign's send window*; the dispatch worker
releases due entries under a throughput cap, and `reflow` re-times the pending queue when
provider throughput changes mid-flight. Second launch is a 409; relaunching never
duplicates queue entries.

## Module map (per MASTER_CODE_SCHEMATICS)
- Entrypoint: `src/server.ts` — port **4008**
- `src/modules/core/routes.ts` — subscribers, events, profiles, campaign launch, dispatch, reflow
- `src/lib/sendtime.ts` — histograms, profiles, window argmax, queue reflow
- `src/lib/store.ts` — in-memory store + deterministic engagement histories

## Run
```bash
pnpm dev:mailchimp
curl localhost:4008/health
```
Demo: `docs/demo-flow.md` · preview: `frontend/demo.html`

Timezone note: scaffold supports UTC/UTC±H offsets; production must use a real tz database
(DST is a named blueprint risk).
