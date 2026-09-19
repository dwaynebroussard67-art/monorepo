/**
 * Smoke harness: boots all 10 app servers in-process (fastify inject) and asserts
 * health + moat behavior + adversarial paths for each. Run: pnpm test:smoke
 */
import { createHash } from "node:crypto";

type Inject = (opts: { method: string; url: string; payload?: unknown }) => Promise<{ statusCode: number; json: () => any }>;
type AppLike = { inject: Inject };

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

const post = (app: AppLike, url: string, payload?: unknown) => app.inject({ method: "POST", url, payload });
const put = (app: AppLike, url: string, payload?: unknown) => app.inject({ method: "PUT", url, payload });
const get = (app: AppLike, url: string) => app.inject({ method: "GET", url });
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Strictly-future UTC date (YYYY-MM-DD) for the next occurrence of a weekday. */
function nextWeekdayDate(targetDow: number, daysOut = 1): string {
  const now = new Date();
  for (let i = daysOut; i < daysOut + 14; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i));
    if (d.getUTCDay() === targetDow) return d.toISOString().slice(0, 10);
  }
  throw new Error("no weekday found");
}

/** Strictly-future epoch ms for the next occurrence of a UTC weekday+hour. */
function nextWeekdayUtcMs(targetDow: number, hour: number): number {
  const now = Date.now();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now + i * 86_400_000);
    const candidate = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0, 0);
    if (d.getUTCDay() === targetDow && candidate > now) return candidate;
  }
  throw new Error("no slot found");
}

async function main() {
  const names = [
    "live-commerce", "calendly-meeting-intel", "patreon-coownership", "notion-living-docs",
    "teachable-struggle-detector", "opentable-taste-passport", "fiverr-squad-bidding",
    "mailchimp-send-time", "eventbrite-matchmaking", "linkedin-proof-of-work"
  ] as const;

  const apps = new Map<string, AppLike>();
  for (const name of names) {
    const mod = await import(`../apps/${name}/src/server.ts`);
    apps.set(name, await mod.buildServer());
  }

  // ---- 0. health everywhere ------------------------------------------------
  console.log("\n[health]");
  for (const name of names) {
    const res = await get(apps.get(name)!, "/health");
    const body = res.json();
    check(`${name} /health`, res.statusCode === 200 && body.ok === true && body.service === name, body);
  }

  // ---- 1. live-commerce ----------------------------------------------------
  console.log("\n[live-commerce]");
  const lc = apps.get("live-commerce")!;
  const proof = (await get(lc, "/stores/store_aurora/social-proof")).json().data;
  check("proof messages generated", proof.messages.length >= 2, proof);
  check("bot traffic quarantined (>0)", proof.stats.quarantinedEvents > 0, proof.stats);
  check("quiet product gets no proof", !proof.messages.some((m: any) => m.productId === "prod_wool_socks"), proof.messages);
  const badBody = await post(lc, "/stores/store_aurora/events", { events: [{ type: "hack" }] });
  check("malformed event batch rejected 400", badBody.statusCode === 400, badBody.json());
  const token = (await post(lc, "/streams/stream_launch/buy-now", { productId: "prod_trail_jacket", viewerRef: "viewer_7" })).json().data;
  const redeem1 = await post(lc, `/streams/buy-now/${token.id}/redeem`);
  const redeem2 = await post(lc, `/streams/buy-now/${token.id}/redeem`);
  check("buy-now redeems once (201)", redeem1.statusCode === 201, redeem1.json());
  check("buy-now single-use invariant (409 on replay)", redeem2.statusCode === 409, redeem2.json());

  // ---- 2. calendly-meeting-intel -------------------------------------------
  console.log("\n[calendly-meeting-intel]");
  const ci = apps.get("calendly-meeting-intel")!;
  const date = nextWeekdayDate(1); // next Monday (seeded availability Mon–Fri)
  const slotsBody = (await get(ci, `/availability/intro/slots?date=${date}`)).json().data;
  check("slots computed for weekday", Array.isArray(slotsBody.slots) && slotsBody.slots.length > 0, slotsBody);
  const slot = slotsBody.slots[0];
  const bookingRes = await post(ci, "/bookings", { eventTypeSlug: "intro", inviteeName: "Sam Rivera", inviteeEmail: "sam@nimbus.io", startAt: slot.startAt });
  check("booking created 201", bookingRes.statusCode === 201, bookingRes.json());
  const booking = bookingRes.json().data.booking;
  const dup = await post(ci, "/bookings", { eventTypeSlug: "intro", inviteeName: "Sam", inviteeEmail: "sam@nimbus.io", startAt: slot.startAt });
  check("double-booking rejected 409", dup.statusCode === 409, dup.json());
  const briefs = (await get(ci, `/bookings/${booking.id}/briefs?audience=host`)).json().data;
  check("host pre-brief has ranked enrichment", briefs.length === 1 && briefs[0].signals.some((s: any) => s.summary.includes("Nimbus")), briefs);
  const weekend = nextWeekdayDate(6); // Saturday: seeded rules are Mon–Fri
  check("no slots on unstaffed weekend", (await get(ci, `/availability/intro/slots?date=${weekend}`)).json().data.slots.length === 0);
  const tr = await post(ci, `/bookings/${booking.id}/transcripts`, {
    text: "Sam: We decided to pilot with the growth team.\nMaya: I'll send the pilot agreement by friday.\nSam: I will intro you to our CTO by tomorrow."
  });
  const items = tr.json().data.summary.actionItems as Array<any>;
  check("action items extracted with owners", items.length >= 2 && items.every((i) => i.owner), items);
  check("due date parsed for 'by friday'", items.some((i) => i.dueAt), items);
  const sync1 = await post(ci, `/bookings/${booking.id}/sync/crm`, { provider: "hubspot" });
  const sync2 = await post(ci, `/bookings/${booking.id}/sync/crm`, { provider: "hubspot" });
  check("crm sync idempotent", sync1.statusCode === 201 && sync2.statusCode === 200 && sync2.json().data.deduplicated === true, [sync1.statusCode, sync2.json()]);

  // ---- 3. patreon-coownership ----------------------------------------------
  console.log("\n[patreon-coownership]");
  const pc = apps.get("patreon-coownership")!;
  const scores = (await post(pc, "/creators/creator_cora/scores/run")).json().data as Array<any>;
  check("superfan scores computed", scores.length === 3, scores);
  check("ana outranks cleo (fraud penalty bites)", scores[0].fanUserId === "fan_ana" && scores[2].fanUserId === "fan_cleo", scores.map((s) => [s.fanUserId, s.score]));
  const accrue = (await post(pc, "/programs/prog_forge/accrue")).json().data;
  check("ledger invariant balanced", accrue.invariant.balanced === true && accrue.invariant.totalDebit === accrue.invariant.totalCredit, accrue.invariant);
  const dist = (await post(pc, "/pools/pool_october/distribute")).json().data;
  check("distribution reconciles to the cent", dist.reconciliation.distributedCents === dist.reconciliation.poolCents, dist.reconciliation);
  const dist2 = await post(pc, "/pools/pool_october/distribute");
  check("pool cannot distribute twice (409)", dist2.statusCode === 409, dist2.json());

  // ---- 4. notion-living-docs ------------------------------------------------
  console.log("\n[notion-living-docs]");
  const nd = apps.get("notion-living-docs")!;
  const audit = (await post(nd, "/workspaces/ws_acme/audit")).json().data;
  check("audit flags contradiction", audit.summary.contradictions >= 1, audit.summary);
  check("audit flags stale + dormant", audit.summary.stale >= 1 && audit.summary.dormantActions >= 1, audit.summary);
  const alerts = (await get(nd, "/workspaces/ws_acme/alerts")).json().data as Array<any>;
  const contra = alerts.find((a) => a.alertType === "contradiction");
  check("contradiction alert carries evidence spans", !!contra?.evidence?.assertionA && !!contra?.evidence?.assertionB, contra);
  const fix = await put(nd, "/pages/page_pricing_faq/content", { plainText: "The Pro plan costs $20 per seat. Trials last 14 days.", createdBy: "sam" });
  check("editing the source resolves the contradiction", fix.json().data.audit.contradictions === 0, fix.json().data.audit);

  // ---- 5. teachable-struggle-detector ---------------------------------------
  console.log("\n[teachable-struggle-detector]");
  const ts = apps.get("teachable-struggle-detector")!;
  const analysis = (await post(ts, "/lessons/lesson_backprop/analyze")).json().data;
  check("struggle segments detected", analysis.segments.length > 0, analysis.segments);
  check("segments carry signal breakdown", !!analysis.segments[0]?.breakdown?.rewindCluster && analysis.segments[0].breakdown.conceptFailRate >= 0, analysis.segments[0]);
  const top = analysis.segments[0];
  check("worst segment is the 200–240s confusion window", top.startSec >= 180 && top.startSec <= 240, top);
  check("clarification card drafted INACTIVE (approval gate)", analysis.clarificationCard && analysis.clarificationCard.active === false, analysis.clarificationCard);
  const approved = (await post(ts, `/clarification-cards/${analysis.clarificationCard.id}/approve`)).json().data;
  check("instructor approval activates card", approved.active === true, approved);
  const oob = await post(ts, "/lessons/lesson_backprop/events", { events: [{ studentId: "s9", type: "watch", secondMark: 99999 }] });
  check("event beyond lesson duration rejected 400", oob.statusCode === 400, oob.json());

  // ---- 6. opentable-taste-passport ------------------------------------------
  console.log("\n[opentable-taste-passport]");
  const ot = apps.get("opentable-taste-passport")!;
  const newRes = (await post(ot, "/reservations", { restaurantId: "rest_lumen", dinerId: "diner_noa", startsAt: Date.now() + 20 * 60_000, partySize: 2, occasion: "anniversary" })).json().data;
  const denied = await get(ot, `/reservations/${newRes.id}/brief?role=server`);
  check("non-host brief access denied 403", denied.statusCode === 403, denied.json());
  await post(ot, `/reservations/${newRes.id}/confirm`);
  const briefRes = await get(ot, `/reservations/${newRes.id}/brief?role=host`);
  const brief = briefRes.json().data;
  check("host brief derived (200)", briefRes.statusCode === 200, briefRes.json());
  check("brief contains derived traits", /vegetarian/i.test(brief.summaryText) && /shellfish/i.test(brief.summaryText) && /low-sodium/i.test(brief.summaryText), brief.summaryText);
  const replay = await get(ot, `/reservations/${newRes.id}/brief?role=host`);
  check("brief token single-use (409 on second read)", replay.statusCode === 409, replay.json());

  // ---- 7. fiverr-squad-bidding ----------------------------------------------
  console.log("\n[fiverr-squad-bidding]");
  const fs = apps.get("fiverr-squad-bidding")!;
  const sug = (await get(fs, "/projects/proj_platform/squad-suggestions")).json().data;
  check("suggestions cover all required skills", sug.suggestions.length > 0 && sug.suggestions.every((s: any) => s.coverage === 1 && s.missingSkills.length === 0), sug);
  check("suggestions ranked with no duplicates", sug.suggestions.every((s: any, i: number, a: any[]) => i === 0 || a[i - 1].score >= s.score), sug.suggestions);
  const badSquad = await post(fs, "/projects/proj_platform/squads", { leadFreelancerId: "fl_rhea", members: [{ freelancerId: "fl_rhea", roleTitle: "Design", splitPercent: 60 }, { freelancerId: "fl_noor", roleTitle: "Backend", splitPercent: 30 }] });
  check("splits not summing to 100 rejected 400", badSquad.statusCode === 400, badSquad.json());
  const squad = (await post(fs, "/projects/proj_platform/squads", {
    leadFreelancerId: "fl_rhea",
    members: [
      { freelancerId: "fl_rhea", roleTitle: "Design lead", splitPercent: 35 },
      { freelancerId: "fl_noor", roleTitle: "Backend", splitPercent: 35 },
      { freelancerId: "fl_malik", roleTitle: "DevOps", splitPercent: 30 }
    ]
  })).json().data;
  check("squad formed", !!squad.id, squad);
  await post(fs, `/squads/${squad.id}/proposals`, { content: "Portal rebuild v1" });
  const contract = (await post(fs, `/squads/${squad.id}/contract`, {
    milestones: [{ title: "MVP", amountCents: 1_000_000, ownerFreelancerId: "fl_noor" }, { title: "Launch", amountCents: 3_000_000, ownerFreelancerId: "fl_rhea" }]
  })).json().data;
  const msId = (await get(fs, `/contracts/${contract.id}`)).json().data.milestones[0].id;
  const approve = (await post(fs, `/milestones/${msId}/approve`)).json().data;
  check("milestone release reconciles exactly", approve.reconciliation.releasedCents === approve.reconciliation.milestoneCents, approve.reconciliation);
  const reApprove = await post(fs, `/milestones/${msId}/approve`);
  check("milestone approval idempotent (409)", reApprove.statusCode === 409, reApprove.json());

  // ---- 8. mailchimp-send-time -------------------------------------------------
  console.log("\n[mailchimp-send-time]");
  const mc = apps.get("mailchimp-send-time")!;
  const profAna = (await post(mc, "/subscribers/sub_ana/profile/rebuild")).json().data;
  check("warm subscriber is personalized", profAna.source === "personalized" && profAna.topSlots.length > 0, profAna);
  const profCleo = (await post(mc, "/subscribers/sub_cleo/profile/rebuild")).json().data;
  check("cold subscriber uses cohort fallback", profCleo.source !== "personalized" && profCleo.confidence <= 0.35, profCleo);
  const tueStart = nextWeekdayUtcMs(2, 8);
  const tueEnd = tueStart + 14 * 3_600_000;
  const campaign = (await post(mc, "/campaigns", { audienceId: "aud_aurora", subject: "October Drop", windowStart: tueStart, windowEnd: tueEnd })).json().data;
  const launch = (await post(mc, `/campaigns/${campaign.id}/launch`)).json().data;
  const anaEntry = launch.queue.find((q: any) => q.subscriberId === "sub_ana");
  check("queue entry per recipient", launch.queue.length === 3, launch.queue);
  check("ana lands at her Tuesday 09:00 slot", new Date(anaEntry.releaseAt).getUTCDay() === 2 && new Date(anaEntry.releaseAt).getUTCHours() === 9, anaEntry);
  const relaunch = await post(mc, `/campaigns/${campaign.id}/launch`);
  check("campaign double-launch rejected 409", relaunch.statusCode === 409, relaunch.json());
  const dispatched = (await post(mc, `/campaigns/${campaign.id}/dispatch`, { now: tueEnd + 1, throughput: 2 })).json().data;
  check("dispatch respects throughput cap", dispatched.sent.length === 2, dispatched);
  const reflow = (await post(mc, `/campaigns/${campaign.id}/reflow`, { throughputPerMinute: 1 })).json().data;
  check("reflow keeps queue intact", reflow.queue.length === 3, reflow.queue);

  // ---- 9. eventbrite-matchmaking ----------------------------------------------
  console.log("\n[eventbrite-matchmaking]");
  const em = apps.get("eventbrite-matchmaking")!;
  const generated = (await post(em, "/events/ev_founders/matches/generate")).json().data;
  const fayeList = generated.lists.find((l: any) => l.attendeeId === "att_faye");
  check("faye's #1 match is the investor (complementarity wins)", fayeList.matches[0]?.attendeeId === "att_ivan", fayeList.matches);
  check("opted-out sid receives no brief", !generated.lists.some((l: any) => l.attendeeId === "att_sid"));
  check("prior connection suppressed in scores", generated.scores.some((s: any) => s.suppressed && [s.attendeeA, s.attendeeB].sort().join(",") === "att_faye,att_sam"), generated.scores);
  const signal = await post(em, "/events/ev_founders/signals", { fromId: "att_faye", toId: "att_ivan", zoneId: "zone_lounge" });
  check("ranked pair can signal (201)", signal.statusCode === 201, signal.json());
  const signalSid = await post(em, "/events/ev_founders/signals", { fromId: "att_faye", toId: "att_sid", zoneId: "zone_main" });
  check("opted-out target blocked 403", signalSid.statusCode === 403, signalSid.json());
  const respond = await post(em, `/signals/${signal.json().data.id}/respond`, { accept: true });
  check("accept mints a connection", respond.json().data.connection !== null, respond.json());
  const respond2 = await post(em, `/signals/${signal.json().data.id}/respond`, { accept: false });
  check("signal is single-decision (409)", respond2.statusCode === 409, respond2.json());

  // ---- 10. linkedin-proof-of-work ----------------------------------------------
  console.log("\n[linkedin-proof-of-work]");
  const pw = apps.get("linkedin-proof-of-work")!;
  const good = (await post(pw, "/profiles/prof_dana/artifacts", {
    artifactType: "github_commit",
    text: "Rebuilt the payments pipeline in TypeScript and Node, increasing throughput by 38% to 12k qps. Added Postgres advisory locks.",
    payload: { repo: "acme/payments", sha: "d94f04d67b0e1ae5ad0b97a55d588dc70a7d0e0a", signatureVerified: true, authorMatchesAccount: true }
  })).json().data;
  check("genuine commit artifact verifies", good.artifact.verificationStatus === "verified", good.artifact.checks);
  check("claims extracted from verified artifact", good.claims.some((c: any) => c.value === "typescript") && good.claims.some((c: any) => c.claimType === "outcome"), good.claims);
  const forged = (await post(pw, "/profiles/prof_dana/artifacts", {
    artifactType: "github_commit", text: "I am a kubernetes and rust expert.",
    payload: { repo: "acme/x", sha: "d94f04d67b0e1ae5ad0b97a55d588dc70a7d0e0a", signatureVerified: false, authorMatchesAccount: true }
  })).json().data;
  check("forged artifact rejected with failed checks", forged.artifact.verificationStatus === "rejected" && forged.claims.length === 0, forged);
  const challenge = (await post(pw, "/profiles/prof_dana/challenges", { domain: "dana.dev" })).json().data;
  const badApi = (await post(pw, "/profiles/prof_dana/artifacts", {
    artifactType: "live_api", text: "My API serves 100k requests.", payload: { domain: "dana.dev", response: "totally-legit" }
  })).json().data;
  check("wrong challenge response rejected", badApi.artifact.verificationStatus === "rejected", badApi.artifact.checks);
  const goodApi = (await post(pw, "/profiles/prof_dana/artifacts", {
    artifactType: "live_api", text: "Built a GraphQL API serving 100k requests daily on AWS with Rust.",
    payload: { domain: "dana.dev", response: sha256(`${challenge.nonce}:dana.dev`) }
  })).json().data;
  check("correct challenge response verifies", goodApi.artifact.verificationStatus === "verified", goodApi.artifact.checks);
  const recruiter = (await get(pw, "/profiles/prof_dana/recruiter-view")).json().data;
  check("evidence-backed skills ranked", recruiter.evidenceBackedSkills.length >= 2 && recruiter.evidenceBackedSkills[0].skill === "typescript", recruiter.evidenceBackedSkills);
  check("unverified self-declared skill quarantined", recruiter.unverifiedSelfDeclared.includes("design"), recruiter.unverifiedSelfDeclared);

  for (const name of names) {
    const app = apps.get(name) as any;
    if (typeof app.close === "function") await app.close();
  }

  console.log(`\n=========================================`);
  console.log(`SMOKE RESULT: ${passed} passed, ${failed} failed`);
  if (failures.length) console.log(`failed checks:\n - ${failures.join("\n - ")}`);
  console.log(`=========================================`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
