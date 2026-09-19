import type { Booking, Reminder } from "../../lib/store.js";

const HOUR = 60 * 60_000;

/** Reminder plan: 24h + 1h before start, skipped if already in the past. */
export function planReminders(booking: Booking, nextId: (p: string) => string, now: number = Date.now()): Reminder[] {
  const offsets = [24 * HOUR, 1 * HOUR];
  const reminders: Reminder[] = [];
  for (const offset of offsets) {
    const scheduledAt = booking.startAt - offset;
    if (scheduledAt <= now) continue;
    reminders.push({ id: nextId("rem"), bookingId: booking.id, channel: "email", scheduledAt, status: "scheduled" });
  }
  return reminders;
}

export function dueReminders(reminders: Iterable<Reminder>, now: number = Date.now()): Reminder[] {
  return [...reminders].filter((r) => r.status === "scheduled" && r.scheduledAt <= now);
}
