import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, nextId, type ClarificationCard } from "../../lib/store.js";
import { analyzeLesson, draftClarificationCard } from "../../lib/struggle.js";

const eventsSchema = z.object({
  events: z.array(z.object({
    studentId: z.string().min(1),
    type: z.enum(["watch", "seek_back", "pause", "exit"]),
    secondMark: z.number().int().nonnegative(),
    targetSecond: z.number().int().nonnegative().optional()
  })).min(1).max(5000)
});
const attemptSchema = z.object({ studentId: z.string().min(1), questionId: z.string().min(1), correct: z.boolean() });

export async function coreRoutes(app: FastifyInstance) {
  app.get("/courses", async () => ({ ok: true as const, data: [...db.courses.values()] }));

  app.post("/lessons/:lessonId/events", async (req, reply) => {
    const { lessonId } = req.params as { lessonId: string };
    const lesson = db.lessons.get(lessonId);
    if (!lesson) return reply.code(404).send({ ok: false, error: "lesson_not_found" });
    const parsed = eventsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    for (const e of parsed.data.events) {
      if (e.secondMark > lesson.durationSec) return reply.code(400).send({ ok: false, error: "second_mark_beyond_lesson_duration" });
      db.playback.push({ id: nextId("pb"), lessonId, occurredAt: Date.now(), ...e });
    }
    return reply.code(202).send({ ok: true, data: { accepted: parsed.data.events.length } });
  });

  app.post("/lessons/:lessonId/quiz-attempts", async (req, reply) => {
    const { lessonId } = req.params as { lessonId: string };
    if (!db.lessons.has(lessonId)) return reply.code(404).send({ ok: false, error: "lesson_not_found" });
    const parsed = attemptSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    if (!db.questions.has(parsed.data.questionId)) return reply.code(404).send({ ok: false, error: "question_not_found" });
    const attempt = { id: nextId("att"), lessonId, occurredAt: Date.now(), ...parsed.data };
    db.attempts.push(attempt);
    return reply.code(201).send({ ok: true, data: attempt });
  });

  /** Moat: run the struggle analysis; writes segments, alerts and a pending clarification card. */
  app.post("/lessons/:lessonId/analyze", async (req, reply) => {
    const { lessonId } = req.params as { lessonId: string };
    const lesson = db.lessons.get(lessonId);
    if (!lesson) return reply.code(404).send({ ok: false, error: "lesson_not_found" });

    db.segments = db.segments.filter((s) => s.lessonId !== lesson.id); // idempotent re-run
    const segments = analyzeLesson(lesson, db.playback, [...db.questions.values()], db.attempts, nextId);
    db.segments.push(...segments);

    for (const seg of segments) {
      db.alerts.push({
        id: nextId("alert"), lessonId: lesson.id, alertType: "struggle_segment",
        severity: seg.score >= 0.6 ? "high" : seg.score >= 0.45 ? "medium" : "low",
        evidence: { segmentId: seg.id, startSec: seg.startSec, endSec: seg.endSec, breakdown: seg.breakdown }, status: "open"
      });
    }

    // Auto-remediation draft for the worst segment — inactive until an instructor approves (blueprint compliance).
    const cardExists = segments[0]
      ? [...db.cards.values()].some((c) => c.lessonId === lesson.id && c.insertSec === segments[0]!.startSec)
      : true;
    let card: ClarificationCard | undefined;
    if (segments[0] && !cardExists) {
      const content = draftClarificationCard(lesson, segments[0], [...db.questions.values()], db.attempts);
      card = { id: nextId("card"), lessonId: lesson.id, insertSec: segments[0].startSec, content, sourceSegmentId: segments[0].id, active: false };
      db.cards.set(card.id, card);
    }
    return { ok: true, data: { segments, alertsCreated: segments.length, clarificationCard: card ?? null } };
  });

  app.get("/lessons/:lessonId/alerts", async (req, reply) => {
    const { lessonId } = req.params as { lessonId: string };
    if (!db.lessons.has(lessonId)) return reply.code(404).send({ ok: false, error: "lesson_not_found" });
    return { ok: true, data: db.alerts.filter((a) => a.lessonId === lessonId) };
  });

  app.get("/lessons/:lessonId/clarification-cards", async (req, reply) => {
    const { lessonId } = req.params as { lessonId: string };
    if (!db.lessons.has(lessonId)) return reply.code(404).send({ ok: false, error: "lesson_not_found" });
    return { ok: true, data: [...db.cards.values()].filter((c) => c.lessonId === lessonId) };
  });

  /** Instructor approval gate for auto-remediation (default is OFF). */
  app.post("/clarification-cards/:cardId/approve", async (req, reply) => {
    const { cardId } = req.params as { cardId: string };
    const card = db.cards.get(cardId);
    if (!card) return reply.code(404).send({ ok: false, error: "card_not_found" });
    card.active = true;
    return { ok: true, data: card };
  });
}
