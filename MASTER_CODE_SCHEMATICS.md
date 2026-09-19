# Master Code Schematics

This document maps the code-level structure of all 10 apps in the Killer Suite portfolio.

## Live Social Proof Commerce (`apps/live-commerce`)
```text
[HTTP API] -> [Store Routes] -> [In-Memory Store]
           -> [Cart Routes] -> [Order Creation]
           -> [Stream Routes] -> [Pinned Product / Buy Now]
           -> [Social Proof Engine] -> [Realtime Feed Payloads]
```
- Entrypoint: `src/server.ts`
- Port: `4001`
- Key modules:
  - `src/modules/store/routes.ts`
  - `src/modules/cart/routes.ts`
  - `src/modules/streams/routes.ts`
  - `src/lib/social-proof.ts`
  - `src/lib/store.ts`

## Meeting Intelligence Scheduler (`apps/calendly-meeting-intel`)
```text
[HTTP API] -> [Availability Routes] -> [Slot Service]
           -> [Booking Routes] -> [Reminder Scheduler]
           -> [Meeting Intelligence] -> [Pre-Brief / Post-Summary]
           -> [Integration Adapters] -> [Calendar/CRM Sync Payloads]
```
- Entrypoint: `src/server.ts`
- Port: `4002`
- Key modules:
  - `src/modules/availability/routes.ts`
  - `src/modules/bookings/routes.ts`
  - `src/modules/integrations/routes.ts`
  - `src/modules/reminders/service.ts`
  - `src/lib/meeting-intelligence.ts`
  - `src/lib/store.ts`

## Creator Co-Ownership (`apps/patreon-coownership`)
```text
[HTTP API] -> [Membership / Program Routes] -> [Ledger Accrual]
           -> [Revenue Pool Distribution] -> [Payout Preview]
```
- Entrypoint: `src/server.ts`
- Port: `4003`
- Key modules:
  - `src/modules/core/routes.ts`
  - `src/lib/store.ts`
  - `src/lib/ownership.ts`

## Living Document Workspace (`apps/notion-living-docs`)
```text
[HTTP API] -> [Workspace/Page Routes] -> [Version Store]
           -> [Assertion Extractor] -> [Audit Engine]
           -> [Alerts / Graph View]
```
- Entrypoint: `src/server.ts`
- Port: `4004`
- Key modules:
  - `src/modules/workspaces/routes.ts`
  - `src/modules/links/routes.ts`
  - `src/modules/living-docs/engine.ts`
  - `src/lib/assertions.ts`
  - `src/lib/store.ts`

## Student Struggle Detector (`apps/teachable-struggle-detector`)
```text
[HTTP API] -> [Playback / Quiz Ingestion] -> [Telemetry Store]
           -> [Struggle Analyzer] -> [Segment Scores + Clarification Prompts]
```
- Entrypoint: `src/server.ts`
- Port: `4005`
- Key modules:
  - `src/modules/core/routes.ts`
  - `src/lib/store.ts`
  - `src/lib/struggle.ts`

## Taste Profile Passport (`apps/opentable-taste-passport`)
```text
[HTTP API] -> [Reservation Routes] -> [Passport Store]
           -> [Brief Generator] -> [Diner Brief Payload]
```
- Entrypoint: `src/server.ts`
- Port: `4006`
- Key modules:
  - `src/modules/core/routes.ts`
  - `src/lib/store.ts`
  - `src/lib/passport.ts`

## Collaborative Bidding (`apps/fiverr-squad-bidding`)
```text
[HTTP API] -> [Project / Squad Routes] -> [Squad Member Matrix]
           -> [Proposal / Contract State] -> [Payout Preview]
```
- Entrypoint: `src/server.ts`
- Port: `4007`
- Key modules:
  - `src/modules/core/routes.ts`
  - `src/lib/store.ts`
  - `src/lib/squads.ts`

## Send Time Personalization (`apps/mailchimp-send-time`)
```text
[HTTP API] -> [Campaign / Event Routes] -> [Engagement Event Store]
           -> [Profile Builder] -> [Per-Subscriber Schedule]
```
- Entrypoint: `src/server.ts`
- Port: `4008`
- Key modules:
  - `src/modules/core/routes.ts`
  - `src/lib/store.ts`
  - `src/lib/sendtime.ts`

## Serendipity Matchmaking (`apps/eventbrite-matchmaking`)
```text
[HTTP API] -> [Event / Ticket Routes] -> [Attendee Store]
           -> [Match Ranking] -> [Signal-to-Connect]
```
- Entrypoint: `src/server.ts`
- Port: `4009`
- Key modules:
  - `src/modules/core/routes.ts`
  - `src/lib/store.ts`
  - `src/lib/matchmaking.ts`

## Proof-of-Work Profile (`apps/linkedin-proof-of-work`)
```text
[HTTP API] -> [Profile / Artifact Routes] -> [Artifact Store]
           -> [Verification Pipeline] -> [Claim Extraction] -> [Evidence Graph]
```
- Entrypoint: `src/server.ts`
- Port: `4010`
- Key modules:
  - `src/modules/core/routes.ts`
  - `src/lib/store.ts`
  - `src/lib/pow.ts`

