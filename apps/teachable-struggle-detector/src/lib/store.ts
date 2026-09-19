/** In-memory data store. Production target: PostgreSQL + ClickHouse (see prisma/schema.prisma). */

export interface Course { id: string; title: string }
export interface ConceptWindow { startSec: number; endSec: number; conceptTags: string[] }
export interface Lesson { id: string; courseId: string; title: string; durationSec: number; conceptTimeline: ConceptWindow[] }
export type PlaybackType = "watch" | "seek_back" | "pause" | "exit";
export interface PlaybackEvent { id: string; lessonId: string; studentId: string; type: PlaybackType; secondMark: number; targetSecond?: number; occurredAt: number }
export interface Question { id: string; lessonId: string; prompt: string; conceptTags: string[] }
export interface QuizAttempt { id: string; lessonId: string; questionId: string; studentId: string; correct: boolean; occurredAt: number }
export interface SignalBreakdown { rewindCluster: number; pauseCluster: number; replayRate: number; dropoffLift: number; conceptFailRate: number }
export interface StruggleSegment { id: string; lessonId: string; startSec: number; endSec: number; score: number; breakdown: SignalBreakdown }
export interface InstructorAlert { id: string; lessonId: string; alertType: "struggle_segment"; severity: "low" | "medium" | "high"; evidence: unknown; status: "open" }
export interface ClarificationCard { id: string; lessonId: string; insertSec: number; content: { heading: string; body: string; missedConcepts: string[] }; sourceSegmentId: string; active: boolean }

export const db = {
  courses: new Map<string, Course>(),
  lessons: new Map<string, Lesson>(),
  playback: [] as PlaybackEvent[],
  questions: new Map<string, Question>(),
  attempts: [] as QuizAttempt[],
  segments: [] as StruggleSegment[],
  alerts: [] as InstructorAlert[],
  cards: new Map<string, ClarificationCard>()
};

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
}

let seeded = false;
export function seed() {
  if (seeded) return;
  seeded = true;
  const now = Date.now();

  const course: Course = { id: "course_ml101", title: "ML Foundations" };
  db.courses.set(course.id, course);
  const lesson: Lesson = {
    id: "lesson_backprop", courseId: course.id, title: "Backpropagation Intuition", durationSec: 600,
    conceptTimeline: [
      { startSec: 0, endSec: 120, conceptTags: ["neurons"] },
      { startSec: 120, endSec: 300, conceptTags: ["backprop", "gradients"] },
      { startSec: 300, endSec: 600, conceptTags: ["optimization"] }
    ]
  };
  db.lessons.set(lesson.id, lesson);

  for (const [id, prompt, tags] of [
    ["q_chain_rule", "Why does the chain rule matter in backprop?", ["backprop"]],
    ["q_vanishing", "What causes vanishing gradients?", ["backprop", "gradients"]],
    ["q_lr", "What does a too-large learning rate do?", ["optimization"]]
  ] as const) {
    db.questions.set(id, { id, lessonId: lesson.id, prompt, conceptTags: [...tags] });
  }

  // Deterministic telemetry: 12 students, confusion concentrated at 200–240s, dropoffs at 250s.
  const students = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12"];
  students.forEach((studentId, idx) => {
    const lastWatched = idx < 10 ? 400 : 250; // s11, s12 drop at 250s
    for (let sec = 0; sec <= lastWatched; sec += 10) {
      db.playback.push({ id: nextId("pb"), lessonId: lesson.id, studentId, type: "watch", secondMark: sec, occurredAt: now });
    }
    if (idx >= 10) db.playback.push({ id: nextId("pb"), lessonId: lesson.id, studentId, type: "exit", secondMark: 250, occurredAt: now });
  });
  // 6 of 12 rewind into the confusion zone; s1 + s4 rewind the SAME bucket twice (replay signal)
  const seeks: Array<[string, number]> = [
    ["s1", 210], ["s1", 210], ["s2", 210], ["s2", 220],
    ["s3", 220], ["s3", 230], ["s4", 230], ["s4", 230], ["s5", 240], ["s6", 200]
  ];
  for (const [s, target] of seeks) {
    db.playback.push({ id: nextId("pb"), lessonId: lesson.id, studentId: s, type: "seek_back", secondMark: 320, targetSecond: target, occurredAt: now });
  }
  const pauses: Array<[string, number]> = [["s1", 210], ["s2", 220], ["s3", 230], ["s5", 210], ["s6", 240]];
  for (const [s, mark] of pauses) {
    db.playback.push({ id: nextId("pb"), lessonId: lesson.id, studentId: s, type: "pause", secondMark: mark, occurredAt: now });
  }

  // Quiz pain on backprop concepts (~38% fail on backprop-tagged questions; optimization aced)
  for (const s of students) {
    db.attempts.push({ id: nextId("att"), lessonId: lesson.id, questionId: "q_chain_rule", studentId: s, correct: !["s1", "s3", "s5", "s7"].includes(s), occurredAt: now });
    db.attempts.push({ id: nextId("att"), lessonId: lesson.id, questionId: "q_vanishing", studentId: s, correct: !["s2", "s4", "s6", "s8", "s10"].includes(s), occurredAt: now });
    db.attempts.push({ id: nextId("att"), lessonId: lesson.id, questionId: "q_lr", studentId: s, correct: true, occurredAt: now });
  }
}
