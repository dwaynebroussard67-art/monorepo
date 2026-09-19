import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, nextId, type Booking, type Participant } from "../../lib/store.js";
import { buildPreBriefs, computeSlots, isSlotAvailable, summarizeTranscript } from "../../lib/meeting-intelligence.js";
import { planReminders } from "../reminders/service.js";

const createBookingSchema = z.object({
  eventTypeSlug: z.string().min(1),
  inviteeName: z.string().min(1),
  inviteeEmail: z.string().email(),
  startAt: z.number().int().positive()
});
const transcriptSchema = z.object({ text: z.string().min(1).max(200_000) });

export async function bookingRoutes(app: FastifyInstance) {
  app.get("/bookings", async () => ({ ok: true as const, data: [...db.bookings.values()] }));

  /** Booking triggers the whole moat: slot validation -> participants -> reminders -> dual pre-briefs. */
  app.post("/bookings", async (req, reply) => {
    const parsed = createBookingSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const { eventTypeSlug, inviteeName, inviteeEmail, startAt } = parsed.data;
    const eventType = [...db.eventTypes.values()].find((et) => et.slug === eventTypeSlug);
    if (!eventType) return reply.code(404).send({ ok: false, error: "event_type_not_found" });

    const endAt = startAt + eventType.durationMin * 60_000;
    const date = new Date(startAt).toISOString().slice(0, 10);
    const rules = [...db.rules.values()].filter((r) => r.userId === eventType.userId);
    const bookings = [...db.bookings.values()].filter((b) => b.hostUserId === eventType.userId);
    if (!isSlotAvailable({ startAt, endAt }, computeSlots(eventType, rules, bookings, date))) {
      return reply.code(409).send({ ok: false, error: "slot_unavailable" });
    }

    const host = db.users.get(eventType.userId)!;
    const booking: Booking = {
      id: nextId("bk"), eventTypeId: eventType.id, hostUserId: host.id,
      inviteeName, inviteeEmail, startAt, endAt, status: "confirmed", createdAt: Date.now()
    };
    db.bookings.set(booking.id, booking);

    const participants: Participant[] = [
      { id: nextId("part"), bookingId: booking.id, role: "host", email: host.email, fullName: host.name },
      { id: nextId("part"), bookingId: booking.id, role: "invitee", email: inviteeEmail, fullName: inviteeName, company: inviteeEmail.split("@")[1]?.split(".")[0] }
    ];
    for (const p of participants) db.participants.set(p.id, p);

    const reminders = planReminders(booking, nextId);
    for (const reminder of reminders) db.reminders.set(reminder.id, reminder);
    const briefs = buildPreBriefs(booking, participants, eventType.title, db.enrichments);
    for (const brief of briefs) db.briefs.set(brief.id, brief);

    return reply.code(201).send({ ok: true, data: { booking, briefIds: briefs.map((b) => b.id), reminderCount: reminders.length } });
  });

  app.get("/bookings/:bookingId", async (req, reply) => {
    const { bookingId } = req.params as { bookingId: string };
    const booking = db.bookings.get(bookingId);
    if (!booking) return reply.code(404).send({ ok: false, error: "booking_not_found" });
    return { ok: true, data: booking };
  });

  app.post("/bookings/:bookingId/cancel", async (req, reply) => {
    const { bookingId } = req.params as { bookingId: string };
    const booking = db.bookings.get(bookingId);
    if (!booking) return reply.code(404).send({ ok: false, error: "booking_not_found" });
    if (booking.status === "cancelled") return reply.code(409).send({ ok: false, error: "already_cancelled" });
    booking.status = "cancelled";
    let cancelled = 0;
    for (const r of db.reminders.values()) {
      if (r.bookingId === booking.id && r.status === "scheduled") { r.status = "cancelled"; cancelled++; }
    }
    return { ok: true, data: { booking, remindersCancelled: cancelled } };
  });

  app.get("/bookings/:bookingId/briefs", async (req, reply) => {
    const { bookingId } = req.params as { bookingId: string };
    if (!db.bookings.has(bookingId)) return reply.code(404).send({ ok: false, error: "booking_not_found" });
    const { audience } = req.query as { audience?: string };
    let briefs = [...db.briefs.values()].filter((b) => b.bookingId === bookingId);
    if (audience === "host" || audience === "invitee") briefs = briefs.filter((b) => b.audience === audience);
    return { ok: true, data: briefs };
  });

  /** Post-meeting: transcript ingestion -> summary + structured action items. */
  app.post("/bookings/:bookingId/transcripts", async (req, reply) => {
    const { bookingId } = req.params as { bookingId: string };
    const booking = db.bookings.get(bookingId);
    if (!booking) return reply.code(404).send({ ok: false, error: "booking_not_found" });
    const parsed = transcriptSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const transcript = { id: nextId("tr"), bookingId: booking.id, text: parsed.data.text, createdAt: Date.now() };
    db.transcripts.set(transcript.id, transcript);
    const { markdown, decisions, actionItems } = summarizeTranscript(parsed.data.text);
    const summary = { id: nextId("sum"), bookingId: booking.id, markdown, decisions, actionItems, generatedAt: Date.now() };
    db.summaries.set(summary.id, summary);
    return reply.code(201).send({ ok: true, data: { transcriptId: transcript.id, summary } });
  });

  app.get("/bookings/:bookingId/summary", async (req, reply) => {
    const { bookingId } = req.params as { bookingId: string };
    const summary = [...db.summaries.values()].filter((s) => s.bookingId === bookingId).at(-1);
    if (!summary) return reply.code(404).send({ ok: false, error: "summary_not_found" });
    return { ok: true, data: summary };
  });
}
