# Demo flow — mailchimp-send-time

Seeded: audience `aud_aurora`; ana opens every Tuesday ~09:00 UTC (9 weeks of history);
ben engages ~20:00 UTC; cleo is brand-new (cold start).

1. `curl localhost:4008/health`
2. `curl -XPOST localhost:4008/subscribers/sub_ana/profile/rebuild`
   — source `personalized`, top slot keys cluster at Tuesday 09:00
3. `curl -XPOST localhost:4008/subscribers/sub_cleo/profile/rebuild`
   — source falls back to a cohort (`timezone` here), confidence ~0.3
4. Create a campaign spanning next Tuesday 08:00–21:00 UTC:
   `curl -XPOST localhost:4008/campaigns -H 'content-type: application/json' \
     -d '{"audienceId":"aud_aurora","subject":"October Drop","windowStart":<ms>,"windowEnd":<ms>}'`
5. `curl -XPOST localhost:4008/campaigns/<id>/launch`
   — ana lands at 09:00, ben at 20:00, cleo at her cohort's best minute;
   second launch → **409 campaign_already_launched**
6. `curl -XPOST localhost:4008/campaigns/<id>/dispatch -H 'content-type: application/json' \
     -d '{"throughput":2}'` — only the due batch sends
7. `curl -XPOST localhost:4008/campaigns/<id>/reflow -H 'content-type: application/json' \
     -d '{"throughputPerMinute":1}'` — pending entries are re-timed, never duplicated
