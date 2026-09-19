import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, nextId, pairKey, type ProximitySignal, type TopMatchList } from "../../lib/store.js";
import { canSignal, scorePair, topMatchesFor } from "../../lib/matchmaking.js";

const attendeeSchema = z.object({
  name: z.string().min(1), headline: z.string().default(""),
  goals: z.array(z.string()).min(1), interests: z.array(z.string()).min(1),
  company: z.string().min(1), role: z.string().min(1), optedIn: z.boolean().default(true)
});
const signalSchema = z.object({ fromId: z.string().min(1), toId: z.string().min(1), zoneId: z.string().min(1) });
const respondSchema = z.object({ accept: z.boolean() });

function priorPairs(eventId: string): Set<string> {
  return new Set(db.connections.filter((c) => c.eventId === eventId).map((c) => pairKey(c.attendeeA, c.attendeeB)));
}

export async function coreRoutes(app: FastifyInstance) {
  app.get("/events", async () => ({ ok: true as const, data: [...db.events.values()] }));

  app.post("/events/:eventId/attendees", async (req, reply) => {
    const { eventId } = req.params as { eventId: string };
    if (!db.events.has(eventId)) return reply.code(404).send({ ok: false, error: "event_not_found" });
    const parsed = attendeeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const attendee = { id: nextId("att"), eventId, ...parsed.data };
    db.attendees.set(attendee.id, attendee);
    return reply.code(201).send({ ok: true, data: attendee });
  });

  /** Moat step 1: pre-event graph ranking — pairwise scores + diversity-constrained Top-5 briefs. */
  app.post("/events/:eventId/matches/generate", async (req, reply) => {
    const { eventId } = req.params as { eventId: string };
    if (!db.events.has(eventId)) return reply.code(404).send({ ok: false, error: "event_not_found" });
    const attendees = [...db.attendees.values()].filter((a) => a.eventId === eventId);
    const prior = priorPairs(eventId);

    for (let i = 0; i < attendees.length; i++) {
      for (let j = i + 1; j < attendees.length; j++) {
        const a = attendees[i]!;
        const b = attendees[j]!;
        const { score, rationale, suppressed } = scorePair(a, b, prior);
        db.matchScores.set(`${eventId}:${pairKey(a.id, b.id)}`, { eventId, attendeeA: a.id, attendeeB: b.id, score, rationale, suppressed });
      }
    }
    const lists: TopMatchList[] = [];
    for (const attendee of attendees) {
      if (!attendee.optedIn) continue; // no briefs for opted-out attendees
      const list: TopMatchList = {
        eventId, attendeeId: attendee.id,
        matches: topMatchesFor(attendee, attendees, prior, 5),
        generatedAt: Date.now()
      };
      db.topLists.set(`${eventId}:${attendee.id}`, list);
      lists.push(list);
    }
    return { ok: true, data: { lists, scores: [...db.matchScores.values()].filter((s) => s.eventId === eventId) } };
  });

  app.get("/events/:eventId/matches/:attendeeId", async (req, reply) => {
    const { eventId, attendeeId } = req.params as { eventId: string; attendeeId: string };
    const list = db.topLists.get(`${eventId}:${attendeeId}`);
    if (!list) return reply.code(404).send({ ok: false, error: "top_list_not_found_generate_first" });
    return { ok: true, data: list };
  });

  /** Moat step 2: live signal-to-connect, gated by opt-in, rank and venue zone. */
  app.post("/events/:eventId/signals", async (req, reply) => {
    const { eventId } = req.params as { eventId: string };
    if (!db.events.has(eventId)) return reply.code(404).send({ ok: false, error: "event_not_found" });
    const parsed = signalSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const { fromId, toId, zoneId } = parsed.data;
    if (fromId === toId) return reply.code(400).send({ ok: false, error: "cannot_signal_self" });
    const from = db.attendees.get(fromId);
    const to = db.attendees.get(toId);
    if (!from || from.eventId !== eventId || !to || to.eventId !== eventId) return reply.code(404).send({ ok: false, error: "attendee_not_found" });
    const zone = db.zones.get(zoneId);
    if (!zone) return reply.code(404).send({ ok: false, error: "zone_not_found" });

    const gate = canSignal({ from, to, zoneEventIds: [zone.eventId], eventId, topList: db.topLists.get(`${eventId}:${fromId}`)?.matches });
    if (!gate.allowed) return reply.code(403).send({ ok: false, error: gate.reason });

    const signal: ProximitySignal = { id: nextId("sig"), eventId, fromId, toId, zoneId, status: "pending", createdAt: Date.now() };
    db.signals.set(signal.id, signal);
    return reply.code(201).send({ ok: true, data: signal });
  });

  app.post("/signals/:signalId/respond", async (req, reply) => {
    const { signalId } = req.params as { signalId: string };
    const signal = db.signals.get(signalId);
    if (!signal) return reply.code(404).send({ ok: false, error: "signal_not_found" });
    if (signal.status !== "pending") return reply.code(409).send({ ok: false, error: "signal_already_resolved" });
    const parsed = respondSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    signal.status = parsed.data.accept ? "accepted" : "declined";
    let connection = null;
    if (parsed.data.accept) {
      connection = { id: nextId("conn"), eventId: signal.eventId, attendeeA: signal.fromId, attendeeB: signal.toId, createdAt: Date.now() };
      db.connections.push(connection);
    }
    return { ok: true, data: { signal, connection } };
  });

  app.get("/events/:eventId/connections", async (req, reply) => {
    const { eventId } = req.params as { eventId: string };
    if (!db.events.has(eventId)) return reply.code(404).send({ ok: false, error: "event_not_found" });
    return { ok: true, data: db.connections.filter((c) => c.eventId === eventId) };
  });
}
