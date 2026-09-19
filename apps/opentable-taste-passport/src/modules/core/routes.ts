import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, nextId, type BriefToken, type TastePassport } from "../../lib/store.js";
import { briefWindow, deriveTraits, redeemBriefToken, summarizeBrief } from "../../lib/passport.js";

const passportSchema = z.object({
  vector: z.object({
    dietaryFlags: z.array(z.string()).default([]),
    allergies: z.array(z.string()).default([]),
    flavorAxes: z.object({ umami: z.number().min(0).max(1), spice: z.number().min(0).max(1), sweet: z.number().min(0).max(1), acid: z.number().min(0).max(1), rich: z.number().min(0).max(1) }),
    servicePrefs: z.array(z.string()).default([])
  }),
  consent: z.object({ granted: z.array(z.enum(["allergies", "dietary", "flavor", "sodium", "occasion", "visits", "service"])) })
});
const reservationSchema = z.object({
  restaurantId: z.string().min(1), dinerId: z.string().min(1),
  startsAt: z.number().int().positive(), partySize: z.number().int().positive().max(20),
  occasion: z.string().optional()
});

export async function coreRoutes(app: FastifyInstance) {
  app.get("/restaurants", async () => ({ ok: true as const, data: [...db.restaurants.values()] }));

  /** Diner-side: upsert the passport with its diner-controlled consent policy. */
  app.put("/diners/:dinerId/passport", async (req, reply) => {
    const { dinerId } = req.params as { dinerId: string };
    if (!db.diners.has(dinerId)) return reply.code(404).send({ ok: false, error: "diner_not_found" });
    const parsed = passportSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const passport: TastePassport = { dinerId, updatedAt: Date.now(), ...parsed.data };
    db.passports.set(dinerId, passport);
    return { ok: true, data: passport };
  });

  app.post("/reservations", async (req, reply) => {
    const parsed = reservationSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    if (!db.restaurants.has(parsed.data.restaurantId)) return reply.code(404).send({ ok: false, error: "restaurant_not_found" });
    if (!db.diners.has(parsed.data.dinerId)) return reply.code(404).send({ ok: false, error: "diner_not_found" });
    const res = { id: nextId("res"), status: "requested" as const, ...parsed.data };
    db.reservations.set(res.id, res);
    return reply.code(201).send({ ok: true, data: res });
  });

  /** Moat trigger: confirmation derives the brief within the consent policy and issues a single-use token. */
  app.post("/reservations/:reservationId/confirm", async (req, reply) => {
    const { reservationId } = req.params as { reservationId: string };
    const res = db.reservations.get(reservationId);
    if (!res) return reply.code(404).send({ ok: false, error: "reservation_not_found" });
    if (res.status === "cancelled") return reply.code(409).send({ ok: false, error: "reservation_cancelled" });
    res.status = "confirmed";

    const passport = db.passports.get(res.dinerId);
    if (!passport) return { ok: true, data: { reservation: res, brief: null, note: "diner has no passport; no brief derived" } };

    const visits = db.visits.get(res.dinerId) ?? [];
    const traits = deriveTraits(passport, visits, res.occasion);
    const summaryText = summarizeBrief(traits);
    db.briefs.set(res.id, { reservationId: res.id, summaryText, traits, generatedAt: Date.now() });

    const window = briefWindow(res.startsAt);
    db.briefTokens.delete(res.id);
    const token: BriefToken = { id: res.id, reservationId: res.id, expiresAt: window.expiresAt, scope: "host_console" };
    db.briefTokens.set(token.id, token);
    return { ok: true, data: { reservation: res, briefAvailableAt: window.availableAt, briefExpiresAt: window.expiresAt } };
  });

  /** Host console: redeem the single-use brief. Role must be host; token is consumed on read. */
  app.get("/reservations/:reservationId/brief", async (req, reply) => {
    const { reservationId } = req.params as { reservationId: string };
    const { role } = req.query as { role?: string };
    if (role !== "host") return reply.code(403).send({ ok: false, error: "host_role_required" });
    const res = db.reservations.get(reservationId);
    if (!res) return reply.code(404).send({ ok: false, error: "reservation_not_found" });
    const token = db.briefTokens.get(reservationId);
    const brief = db.briefs.get(reservationId);
    if (!token || !brief) return reply.code(404).send({ ok: false, error: "brief_not_found_confirm_reservation_first" });
    if (res.status !== "confirmed") return reply.code(409).send({ ok: false, error: "reservation_not_confirmed" });

    const state = redeemBriefToken(token, res.startsAt);
    if (!state.ok) {
      const code = state.reason === "consumed" ? 409 : state.reason === "expired" ? 410 : 425;
      return reply.code(code).send({ ok: false, error: `brief_${state.reason}` });
    }
    token.consumedAt = Date.now();
    return { ok: true, data: { summaryText: brief.summaryText, traits: brief.traits, policy: "reservation-scoped controlled reveal — raw preference history never leaves the diner profile" } };
  });
}
