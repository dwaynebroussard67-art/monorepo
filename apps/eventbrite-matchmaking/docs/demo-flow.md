# Demo flow — eventbrite-matchmaking

Seeded: event `ev_founders` with zones `zone_main`/`zone_lounge`; faye (founder, fundraising),
ivan (investor, deal flow), helen (hiring), jay (job seeking), sam+sid (same company,
data/ml, sid NOT opted in), and a prior faye–sam connection.

1. `curl localhost:4009/health`
2. `curl -XPOST localhost:4009/events/ev_founders/matches/generate`
   — faye↔ivan outranks everything (complementary goals +40); same-company sam↔sid is
   penalized (-30/-10); faye↔sam is `suppressed` (prior connection); sid gets no brief (opted out)
3. `curl localhost:4009/events/ev_founders/matches/att_faye` — her Top list with rationale
4. `curl -XPOST localhost:4009/events/ev_founders/signals -H 'content-type: application/json' \
     -d '{"fromId":"att_faye","toId":"att_ivan","zoneId":"zone_lounge"}'` — 201, pair is ranked
5. Same body to `att_sid` → **403 target_not_opted_in**; before step 2 it would be
   **403 pair_not_ranked_generate_matches_first**; fake zone → 404
6. `curl -XPOST localhost:4009/signals/<id>/respond -H 'content-type: application/json' -d '{"accept":true}'`
   — connection minted; responding twice → **409 signal_already_resolved**
7. `curl localhost:4009/events/ev_founders/connections`
