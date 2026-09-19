# Demo flow — live-commerce

Seeded data: store `store_aurora`, hot product `prod_trail_jacket`, live stream `stream_launch`,
plus 12 quarantined bot events so the confidence engine has fraud to suppress.

1. `curl localhost:4001/health`
2. `curl localhost:4001/stores/store_aurora/social-proof` — proof messages for the jacket only;
   `stats.quarantinedEvents` shows the suppressed bot traffic
3. `curl -XPOST localhost:4001/stores/store_aurora/events -H 'content-type: application/json' \
     -d '{"events":[{"type":"view","anonId":"anon_demo"}]}'` — ingest more traffic
4. `curl -XPOST localhost:4001/streams/stream_launch/pin -H 'content-type: application/json' \
     -d '{"productId":"prod_trail_jacket"}'`
5. `curl -XPOST localhost:4001/streams/stream_launch/buy-now -H 'content-type: application/json' \
     -d '{"productId":"prod_trail_jacket","viewerRef":"viewer_7"}'` — copy `data.id`
6. `curl -XPOST localhost:4001/streams/buy-now/<token>/redeem` — first call 201, **second call 409**
   (single-use invariant)
7. Cart flow: POST /carts → POST /carts/:id/items → POST /carts/:id/checkout
   (checkout decrements inventory and emits purchase events back into the proof loop)
