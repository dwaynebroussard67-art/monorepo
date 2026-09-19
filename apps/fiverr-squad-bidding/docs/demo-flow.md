# Demo flow — fiverr-squad-bidding

Seeded: project `proj_platform` (scope needs react + node + devops; budget $40,000) and
freelancers rhea (react/design), noor (node/typescript), malik (devops/node), june (qa/react),
ivan (python/ml).

1. `curl localhost:4007/health`
2. `curl localhost:4007/projects/proj_platform/squad-suggestions`
   — full-coverage combos ranked (rhea+noor+malik tops the list)
3. `curl -XPOST localhost:4007/projects/proj_platform/squads -H 'content-type: application/json' \
     -d '{"leadFreelancerId":"fl_rhea","members":[{"freelancerId":"fl_rhea","roleTitle":"Design lead","splitPercent":35},{"freelancerId":"fl_noor","roleTitle":"Backend","splitPercent":35},{"freelancerId":"fl_malik","roleTitle":"DevOps","splitPercent":30}]}'`
   — split sums of anything but 100 → **400 invalid_splits**
4. `curl -XPOST localhost:4007/squads/<id>/proposals -H 'content-type: application/json' -d '{"content":"v1 scope..."}'`
5. `curl -XPOST localhost:4007/squads/<id>/contract -H 'content-type: application/json' \
     -d '{"milestones":[{"title":"MVP","amountCents":1000000,"ownerFreelancerId":"fl_noor"},{"title":"Launch","amountCents":3000000,"ownerFreelancerId":"fl_rhea"}]}'`
6. `curl -XPOST localhost:4007/milestones/<msId>/approve`
   — payouts release per split table; `reconciliation.releasedCents === milestoneCents`;
   second approval → **409 milestone_already_approved**
7. `curl localhost:4007/contracts/<contractId>` — unified view: terms, milestones, payouts
