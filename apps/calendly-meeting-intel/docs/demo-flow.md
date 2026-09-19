# Demo flow — calendly-meeting-intel

Seeded: host `user_maya` (UTC, Mon–Fri 09:00–17:00), event types `intro` (30m) and `demo` (45m),
enrichment data for `sam@nimbus.io`.

1. `curl localhost:4002/health`
2. Pick a weekday date `D` (YYYY-MM-DD), then:
   `curl 'localhost:4002/availability/intro/slots?date=D'` — buffered, collision-free slots
3. `curl -XPOST localhost:4002/bookings -H 'content-type: application/json' \
     -d '{"eventTypeSlug":"intro","inviteeName":"Sam Rivera","inviteeEmail":"sam@nimbus.io","startAt":<slot.startAt>}'`
   — returns booking + `briefIds`; repeat with the same startAt → **409 slot_unavailable**
4. `curl 'localhost:4002/bookings/<id>/briefs?audience=host'` — confidence-ranked pre-brief
5. `curl -XPOST localhost:4002/bookings/<id>/transcripts -H 'content-type: application/json' \
     -d '{"text":"Sam: We decided to pilot with the growth team.\nMaya: I'"'"'ll send the pilot agreement by Friday.\nSam: I will intro you to our CTO by tomorrow.\nACTION: Maya to loop in solutions engineering"}'`
6. `curl localhost:4002/bookings/<id>/summary` — decisions + action items (owners, due dates, review flags)
7. `curl -XPOST localhost:4002/bookings/<id>/sync/crm -H 'content-type: application/json' -d '{"provider":"hubspot"}'`
   — call twice: second response has `deduplicated: true` (idempotency)
8. `curl -XPOST localhost:4002/bookings/<id>/cancel` — cancels pending reminders
