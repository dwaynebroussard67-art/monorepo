# Demo flow — opentable-taste-passport

Seeded: restaurant `rest_lumen`, diner `diner_noa` (vegetarian; shellfish allergy; high umami,
moderate spice+acid; 2 of 3 recent visits said "too salty"), reservation `res_anniv`
(anniversary, starts 3h from server boot).

1. `curl localhost:4006/health`
2. `curl -XPOST localhost:4006/reservations/res_anniv/confirm`
   — derives the brief inside the consent policy; returns the token window
3. `curl 'localhost:4006/reservations/res_anniv/brief?role=server'` → **403 host_role_required**
4. `curl 'localhost:4006/reservations/res_anniv/brief?role=host'`
   — seeded demo tokens are redeemable immediately IF now is within
   [start-30m, start]; otherwise you get **425 brief_not_yet_available** or **410 brief_expired**
   (the window enforcement is the point). Brief reads:
   “Vegetarian; shellfish allergy; enjoys high umami, moderate acid and moderate spice;
   low-sodium preference inferred from last 3 visits; service: quiet-corner, counter-seating-ok;
   anniversary noted.”
5. Repeat step 4 → **409 brief_consumed** (single-use)
6. Update consent to withhold flavor/visits scopes, create + confirm a new reservation:
   the next brief omits those traits — controlled reveal by policy, not by honor system.

Tip: to see the happy path instantly, create a reservation with `startsAt` ~20 minutes in
the future and confirm it.
