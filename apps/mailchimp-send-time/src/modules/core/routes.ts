import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, nextId, type EngagementEvent, type QueueEntry, type SendProfile, type Subscriber } from "../../lib/store.js";
import { bestSlotInWindow, buildHistogram, buildProfile, dueForDispatch, mergeHistograms, reflowQueue, tzOffsetMinutes, COLD_START_MIN_EVENTS } from "../../lib/sendtime.js";

const subscriberSchema = z.object({ email: z.string().email(), tz: z.string().regex(/^UTC([+-]\d{1,2})?$/, "use UTC or UTC±H"), segment: z.string().optional() });
const eventSchema = z.object({ type: z.enum(["open", "click"]), occurredAt: z.number().int().positive().optional() });
const campaignSchema = z.object({
  audienceId: z.string().min(1), subject: z.string().min(1),
  windowStart: z.number().int().positive(), windowEnd: z.number().int().positive()
});
const reflowSchema = z.object({ throughputPerMinute: z.number().int().positive().max(10_000) });

/** Cohort histograms for the cold-start fallback chain. */
function cohortHists(subscriber: Subscriber): { segmentHist?: Map<number, number>; timezoneHist?: Map<number, number>; globalHist: Map<number, number> } {
  const warm = [...db.subscribers.values()].filter((s) => db.engagement.filter((e) => e.subscriberId === s.id).length >= COLD_START_MIN_EVENTS);
  const histOf = (s: Subscriber): Map<number, number> => buildHistogram(db.engagement.filter((e) => e.subscriberId === s.id), tzOffsetMinutes(s.tz));
  const segmentMates = warm.filter((s) => subscriber.segment && s.segment === subscriber.segment && s.id !== subscriber.id);
  const tzMates = warm.filter((s) => s.tz === subscriber.tz && s.id !== subscriber.id);
  return {
    segmentHist: segmentMates.length ? mergeHistograms(segmentMates.map(histOf)) : undefined,
    timezoneHist: tzMates.length ? mergeHistograms(tzMates.map(histOf)) : undefined,
    globalHist: mergeHistograms(warm.map(histOf))
  };
}

function ensureProfile(subscriber: Subscriber): SendProfile {
  const events = db.engagement.filter((e) => e.subscriberId === subscriber.id);
  const profile = buildProfile({ subscriber, events, ...cohortHists(subscriber) });
  db.profiles.set(subscriber.id, profile);
  return profile;
}

/** The profile's full histogram for scheduling (rebuilt deterministically for the scaffold). */
function schedulingHist(subscriber: Subscriber, profile: SendProfile): { hist: Map<number, number>; tzOffset: number } {
  const events = db.engagement.filter((e) => e.subscriberId === subscriber.id);
  const tzOffset = tzOffsetMinutes(subscriber.tz);
  if (profile.source === "personalized") return { hist: buildHistogram(events, tzOffset), tzOffset };
  const cohorts = cohortHists(subscriber);
  if (profile.source === "segment") return { hist: cohorts.segmentHist!, tzOffset };
  if (profile.source === "timezone") return { hist: cohorts.timezoneHist ?? cohorts.globalHist, tzOffset };
  return { hist: cohorts.globalHist, tzOffset };
}

export async function coreRoutes(app: FastifyInstance) {
  app.post("/audiences/:audienceId/subscribers", async (req, reply) => {
    const { audienceId } = req.params as { audienceId: string };
    if (!db.audiences.has(audienceId)) return reply.code(404).send({ ok: false, error: "audience_not_found" });
    const parsed = subscriberSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const sub: Subscriber = { id: nextId("sub"), audienceId, ...parsed.data };
    db.subscribers.set(sub.id, sub);
    return reply.code(201).send({ ok: true, data: sub });
  });

  app.post("/subscribers/:subscriberId/events", async (req, reply) => {
    const { subscriberId } = req.params as { subscriberId: string };
    if (!db.subscribers.has(subscriberId)) return reply.code(404).send({ ok: false, error: "subscriber_not_found" });
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const event: EngagementEvent = { id: nextId("eng"), subscriberId, type: parsed.data.type, occurredAt: parsed.data.occurredAt ?? Date.now() };
    db.engagement.push(event);
    return reply.code(202).send({ ok: true, data: event });
  });

  /** Moat step 1: minute-level profile with cold-start fallback hierarchy. */
  app.post("/subscribers/:subscriberId/profile/rebuild", async (req, reply) => {
    const { subscriberId } = req.params as { subscriberId: string };
    const subscriber = db.subscribers.get(subscriberId);
    if (!subscriber) return reply.code(404).send({ ok: false, error: "subscriber_not_found" });
    return { ok: true, data: ensureProfile(subscriber) };
  });

  app.post("/campaigns", async (req, reply) => {
    const parsed = campaignSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    if (!db.audiences.has(parsed.data.audienceId)) return reply.code(404).send({ ok: false, error: "audience_not_found" });
    if (parsed.data.windowEnd <= parsed.data.windowStart) return reply.code(400).send({ ok: false, error: "windowEnd_must_exceed_windowStart" });
    const campaign = { id: nextId("camp"), status: "draft" as const, ...parsed.data };
    db.campaigns.set(campaign.id, campaign);
    return reply.code(201).send({ ok: true, data: campaign });
  });

  /** Moat step 2: per-recipient argmax scheduling inside the campaign window. */
  app.post("/campaigns/:campaignId/launch", async (req, reply) => {
    const { campaignId } = req.params as { campaignId: string };
    const campaign = db.campaigns.get(campaignId);
    if (!campaign) return reply.code(404).send({ ok: false, error: "campaign_not_found" });
    if (campaign.status === "launched") return reply.code(409).send({ ok: false, error: "campaign_already_launched" });
    campaign.status = "launched";

    const recipients = [...db.subscribers.values()].filter((s) => s.audienceId === campaign.audienceId);
    const entries: QueueEntry[] = [];
    for (const subscriber of recipients) {
      const existing = [...db.queue.values()].find((q) => q.campaignId === campaign.id && q.subscriberId === subscriber.id);
      if (existing) { entries.push(existing); continue; } // relaunch-safe
      const profile = db.profiles.get(subscriber.id) ?? ensureProfile(subscriber);
      const { hist, tzOffset } = schedulingHist(subscriber, profile);
      const best = bestSlotInWindow(hist, campaign.windowStart, campaign.windowEnd, tzOffset);
      const entry: QueueEntry = {
        id: nextId("q"), campaignId: campaign.id, subscriberId: subscriber.id,
        releaseAt: best?.releaseAt ?? campaign.windowStart,
        predictedScore: best?.score ?? 0, status: "pending"
      };
      db.queue.set(entry.id, entry);
      entries.push(entry);
    }
    return { ok: true, data: { campaign, queue: entries.sort((a, b) => a.releaseAt - b.releaseAt) } };
  });

  /** Moat step 3: dispatch worker — send due entries under a throughput cap. */
  app.post("/campaigns/:campaignId/dispatch", async (req, reply) => {
    const { campaignId } = req.params as { campaignId: string };
    if (!db.campaigns.has(campaignId)) return reply.code(404).send({ ok: false, error: "campaign_not_found" });
    const { now, throughput } = req.body as { now?: number; throughput?: number };
    const at = now ?? Date.now();
    const batch = dueForDispatch([...db.queue.values()].filter((q) => q.campaignId === campaignId), at, throughput ?? 5);
    for (const entry of batch) entry.status = "sent";
    return { ok: true, data: { sent: batch.map((e) => ({ subscriberId: e.subscriberId, releaseAt: e.releaseAt })) } };
  });

  /** Dynamic queue reflow when provider throughput changes mid-flight. */
  app.post("/campaigns/:campaignId/reflow", async (req, reply) => {
    const { campaignId } = req.params as { campaignId: string };
    if (!db.campaigns.has(campaignId)) return reply.code(404).send({ ok: false, error: "campaign_not_found" });
    const parsed = reflowSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const moved = reflowQueue([...db.queue.values()].filter((q) => q.campaignId === campaignId), parsed.data.throughputPerMinute);
    return { ok: true, data: { moved, queue: [...db.queue.values()].filter((q) => q.campaignId === campaignId).sort((a, b) => a.releaseAt - b.releaseAt) } };
  });

  app.get("/campaigns/:campaignId/queue", async (req, reply) => {
    const { campaignId } = req.params as { campaignId: string };
    if (!db.campaigns.has(campaignId)) return reply.code(404).send({ ok: false, error: "campaign_not_found" });
    return { ok: true, data: [...db.queue.values()].filter((q) => q.campaignId === campaignId).sort((a, b) => a.releaseAt - b.releaseAt) };
  });
}
