/**
 * Moat: Struggle Detector.
 * Detects where learners break down by looking for CONCENTRATIONS of confusion signals
 * (micro-rewinds, pauses, replays, dropoffs) relative to the lesson-wide baseline, joined
 * with quiz failure rates mapped onto the same timeline windows through concept tags.
 *
 * Design notes:
 * - Rewind/pause/dropoff use lift normalization (bucket rate vs. mean bucket rate), because
 *   absolute densities are too sparse to be meaningful at small cohort sizes. A bucket at
 *   3x the lesson average is treated as a full-strength signal.
 * - Adjacent over-threshold buckets are merged into segments spanning the confusion window.
 */
import type { Lesson, PlaybackEvent, Question, QuizAttempt, SignalBreakdown, StruggleSegment } from "./store.js";

export const BUCKET_SEC = 10;
export const STRUGGLE_THRESHOLD = 0.35;
const W = { rewind: 0.3, pause: 0.2, replay: 0.15, dropoff: 0.15, conceptFail: 0.2 } as const;
const LIFT_FULL_SIGNAL = 3;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const bucketRange = (b: number) => ({ startSec: b * BUCKET_SEC, endSec: (b + 1) * BUCKET_SEC });

/** Bucket count vs. the lesson-wide mean for that signal, normalized so 3x mean => 1. */
function lift(count: number, total: number, bucketCount: number): number {
  if (total === 0) return 0;
  const mean = total / bucketCount;
  return mean === 0 ? 0 : clamp01(count / mean / LIFT_FULL_SIGNAL);
}

function conceptsForBucket(lesson: Lesson, bucketStartSec: number): string[] {
  const match = lesson.conceptTimeline.find((w) => bucketStartSec >= w.startSec && bucketStartSec < w.endSec);
  return match?.conceptTags ?? [];
}

interface ScoredBucket {
  startSec: number; endSec: number; score: number; breakdown: SignalBreakdown;
}

export function scoreBuckets(lesson: Lesson, events: PlaybackEvent[], questions: Question[], attempts: QuizAttempt[]): ScoredBucket[] {
  const bucketCount = Math.ceil(lesson.durationSec / BUCKET_SEC);
  const lessonEvents = events.filter((e) => e.lessonId === lesson.id);
  const viewers = new Set(lessonEvents.map((e) => e.studentId));
  if (viewers.size === 0) return [];

  const rewindsTotal = lessonEvents.filter((e) => e.type === "seek_back").length;
  const pausesTotal = lessonEvents.filter((e) => e.type === "pause").length;
  const exitsTotal = lessonEvents.filter((e) => e.type === "exit").length;

  const lessonAttempts = attempts.filter((a) => a.lessonId === lesson.id);
  const questionTags = new Map(questions.map((q) => [q.id, q.conceptTags]));

  const scored: ScoredBucket[] = [];
  for (let b = 0; b < bucketCount; b++) {
    const { startSec, endSec } = bucketRange(b);
    const inBucket = (sec: number) => sec >= startSec && sec < endSec;

    const rewinds = lessonEvents.filter((e) => e.type === "seek_back" && inBucket(e.targetSecond ?? -1)).length;
    const pauses = lessonEvents.filter((e) => e.type === "pause" && inBucket(e.secondMark)).length;
    const exits = lessonEvents.filter((e) => e.type === "exit" && inBucket(e.secondMark)).length;
    const rewatchers = [...viewers].filter((s) =>
      lessonEvents.filter((e) => e.studentId === s && e.type === "seek_back" && inBucket(e.targetSecond ?? -1)).length >= 2
    ).length;

    const tags = conceptsForBucket(lesson, startSec);
    const tagged = lessonAttempts.filter((a) => (questionTags.get(a.questionId) ?? []).some((t) => tags.includes(t)));
    const conceptFailRate = tagged.length === 0 ? 0 : tagged.filter((a) => !a.correct).length / tagged.length;

    const breakdown: SignalBreakdown = {
      rewindCluster: lift(rewinds, rewindsTotal, bucketCount),
      pauseCluster: lift(pauses, pausesTotal, bucketCount),
      replayRate: clamp01(rewatchers / viewers.size),
      dropoffLift: lift(exits, exitsTotal, bucketCount),
      conceptFailRate: clamp01(conceptFailRate)
    };
    const score =
      W.rewind * breakdown.rewindCluster + W.pause * breakdown.pauseCluster +
      W.replay * breakdown.replayRate + W.dropoff * breakdown.dropoffLift +
      W.conceptFail * breakdown.conceptFailRate;
    scored.push({ startSec, endSec, score, breakdown });
  }
  return scored;
}

/** Over-threshold buckets, merged into contiguous segments spanning the confusion window. */
export function analyzeLesson(
  lesson: Lesson,
  events: PlaybackEvent[],
  questions: Question[],
  attempts: QuizAttempt[],
  nextId: (p: string) => string
): StruggleSegment[] {
  const scoring = scoreBuckets(lesson, events, questions, attempts);
  const passing = scoring.filter((b) => b.score >= STRUGGLE_THRESHOLD);

  const segments: StruggleSegment[] = [];
  let group: ScoredBucket[] = [];
  const flush = () => {
    if (group.length === 0) return;
    const peak = group.reduce((a, b) => (b.score > a.score ? b : a));
    segments.push({
      id: nextId("seg"), lessonId: lesson.id,
      startSec: group[0]!.startSec, endSec: group[group.length - 1]!.endSec,
      score: Number(peak.score.toFixed(3)), breakdown: peak.breakdown
    });
    group = [];
  };
  for (const bucket of passing) {
    const last = group[group.length - 1];
    if (!last || bucket.startSec === last.endSec) group.push(bucket);
    else { flush(); group.push(bucket); }
  }
  flush();
  return segments.sort((a, b) => b.score - a.score);
}

/** Suggest remediation copy from the worst segment's concepts + the questions students missed. */
export function draftClarificationCard(lesson: Lesson, segment: StruggleSegment, questions: Question[], attempts: QuizAttempt[]): { heading: string; body: string; missedConcepts: string[] } {
  const tags = conceptsForBucket(lesson, segment.startSec);
  const missed = attempts.filter((a) => a.lessonId === lesson.id && !a.correct);
  const missedQuestions = [...new Map(
    questions.filter((q) => missed.some((m) => m.questionId === q.id)).map((q) => [q.id, q.prompt])
  ).values()];
  return {
    heading: `Quick clarification — ${formatTime(segment.startSec)} to ${formatTime(segment.endSec)}`,
    body: `Many learners struggled here (${Math.round(segment.score * 100)}% struggle score). Revisit ${tags.join(", ") || "this concept"} with a concrete worked example. Related quiz items students missed: ${missedQuestions.slice(0, 2).join(" · ") || "n/a"}`,
    missedConcepts: tags
  };
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
