import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../lib/store.js";
import { computeSlots } from "../../lib/meeting-intelligence.js";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
});

export async function availabilityRoutes(app: FastifyInstance) {
  /** Public booking-page surface: available slots for an event type on a UTC date. */
  app.get("/availability/:slug/slots", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_query", details: parsed.error.flatten() });
    const eventType = [...db.eventTypes.values()].find((et) => et.slug === slug);
    if (!eventType) return reply.code(404).send({ ok: false, error: "event_type_not_found" });
    const rules = [...db.rules.values()].filter((r) => r.userId === eventType.userId);
    const bookings = [...db.bookings.values()].filter((b) => b.hostUserId === eventType.userId);
    const slots = computeSlots(eventType, rules, bookings, parsed.data.date);
    return { ok: true, data: { eventType: { slug: eventType.slug, title: eventType.title, durationMin: eventType.durationMin }, date: parsed.data.date, slots } };
  });
}
