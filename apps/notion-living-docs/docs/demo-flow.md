# Demo flow — notion-living-docs

Seeded workspace `ws_acme` with: two pages disagreeing about Pro pricing ($20 vs $25),
a 45-day-old strategy page referencing a past year, and an action untouched for 20 days.

1. `curl localhost:4004/health`
2. `curl -XPOST localhost:4004/workspaces/ws_acme/audit`
   — summary: 1 contradiction, 1 stale, 1 dormant
3. `curl localhost:4004/workspaces/ws_acme/alerts`
   — each alert carries evidence spans (both assertion texts) + severity
4. `curl localhost:4004/workspaces/ws_acme/health` — health score
5. Fix the contradiction at the source:
   `curl -XPUT localhost:4004/pages/page_pricing_faq/content -H 'content-type: application/json' \
     -d '{"plainText":"The Pro plan costs $20 per seat. Trials last 14 days.","createdBy":"sam"}'`
   — response shows refreshed assertion count AND the auto-run audit: contradiction resolved
6. `curl localhost:4004/workspaces/ws_acme/graph`
   — nodes + edges (explicit links and any live contradiction edges)
7. `curl -XPOST localhost:4004/pages/page_pricing/links -H 'content-type: application/json' \
     -d '{"targetPageId":"page_pricing_faq"}'` — same call twice → **409 link_exists**
