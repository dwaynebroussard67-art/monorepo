import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, nextId, type SyncLog } from "../../lib/store.js";
import { syncKey } from "../../lib/meeting-intelligence.js";

const syncSchema = z.object({ provider: z.string().min(1).default("google") });

/** Calendar/CRM writeback. Idempotent: same (booking, kind, provider, version) never double-writes. */
export async function integrationRoutes(app: FastifyInstance) {
  for (const kind of ["calendar", "crm"] as const) {
    app.post(`/bookings/:bookingId/sync/${kind}`, async (req, reply) => {
      const { bookingId } = req.params as { bookingId: string };
      const booking = db.bookings.get(bookingId);
      if (!booking) return reply.code(404).send({ ok: false, error: "booking_not_found" });
      const parsed = syncSchema.safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });

      const summaryCount = [...db.summaries.values()].filter((s) => s.bookingId === booking.id).length;
      const key = syncKey(booking.id, kind, parsed.data.provider, summaryCount);
      const existing = db.syncLogs.get(key);
      if (existing) return { ok: true, data: { syncLog: existing, deduplicated: true } };

      const latestSummary = [...db.summaries.values()].filter((s) => s.bookingId === booking.id).at(-1);
      const payload = kind === "calendar"
        ? { eventWindow: { startAt: booking.startAt, endAt: booking.endAt }, extendedProperties: { actionItems: latestSummary?.actionItems ?? [] } }
        : { note: latestSummary?.markdown ?? null, tasks: latestSummary?.actionItems ?? [], contact: booking.inviteeEmail };
      const log: SyncLog = { id: nextId("sync"), bookingId: booking.id, kind, provider: parsed.data.provider, idempotencyKey: key, payload, status: "synced" };
      db.syncLogs.set(key, log);
      return reply.code(201).send({ ok: true, data: { syncLog: log, deduplicated: false } });
    });
  }

  app.get("/bookings/:bookingId/sync", async (req, reply) => {
    const { bookingId } = req.params as { bookingId: string };
    if (!db.bookings.has(bookingId)) return reply.code(404).send({ ok: false, error: "booking_not_found" });
    return { ok: true, data: [...db.syncLogs.values()].filter((l) => l.bookingId === bookingId) };
  });
}
