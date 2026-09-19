/**
 * Moat: Taste Profile Passport.
 * Derives hospitality-relevant traits from a diner-controlled preference vector +
 * visit history, limited strictly by the reservation-scoped consent policy (controlled
 * reveal: the restaurant gets a derived brief, never the raw preference history).
 *
 * Honest boundary: this scaffold models the consent + derivation + single-use brief
 * token layer. True zero-knowledge/HPKE encryption (blueprint §6) is a production
 * concern — encryption claims are deliberately NOT made here.
 */
import type { ConsentScope, TastePassport, VisitRecord } from "./store.js";

export interface DerivedTraits {
  allergies: string[];
  dietaryFlags: string[];
  topFlavorAxes: string[];
  sodiumSignal: "low_inferred" | null;
  occasion?: string;
  notableServicePrefs: string[];
  visitsSummarized: number;
}

export function deriveTraits(passport: TastePassport, visits: VisitRecord[], occasion: string | undefined): DerivedTraits {
  const granted = new Set<ConsentScope>(passport.consent.granted);
  const v = passport.vector;

  const flavorAxes = granted.has("flavor")
    ? (Object.entries(v.flavorAxes) as Array<[string, number]>).filter(([, score]) => score >= 0.5)
        .sort((a, b) => b[1] - a[1]).map(([axis, score]) => `${score >= 0.7 ? "high" : "moderate"} ${axis}`)
    : [];

  const recent = granted.has("visits") ? visits.slice(0, 5) : [];
  const saltyNotes = recent.filter((r) => r.feedbackNotes.some((n) => /salt|sodiu/i.test(n))).length;

  return {
    allergies: granted.has("allergies") ? [...v.allergies] : [],
    dietaryFlags: granted.has("dietary") ? [...v.dietaryFlags] : [],
    topFlavorAxes: flavorAxes,
    sodiumSignal: granted.has("sodium") && saltyNotes >= 2 ? "low_inferred" : null,
    occasion: granted.has("occasion") ? occasion : undefined,
    notableServicePrefs: granted.has("service") ? [...v.servicePrefs] : [],
    visitsSummarized: recent.length
  };
}

/** Render the concise host-facing brief (blueprint example format). */
export function summarizeBrief(traits: DerivedTraits): string {
  const parts: string[] = [];
  if (traits.dietaryFlags.length) parts.push(traits.dietaryFlags.map(capitalize).join(", "));
  if (traits.allergies.length) parts.push(`${traits.allergies.join(", ")} allergy`);
  if (traits.topFlavorAxes.length) parts.push(`enjoys ${joinAnd(traits.topFlavorAxes)}`);
  if (traits.sodiumSignal === "low_inferred") {
    parts.push(`low-sodium preference inferred from last ${traits.visitsSummarized} visits`);
  }
  if (traits.notableServicePrefs.length) parts.push(`service: ${traits.notableServicePrefs.join(", ")}`);
  if (traits.occasion) parts.push(`${traits.occasion} noted`);
  return parts.length ? `${parts.join("; ")}.` : "No shareable traits (consent policy withheld all scopes).";
}

/** Brief becomes available 30 minutes before the reservation and expires at start time. */
export function briefWindow(reservationStartsAt: number): { availableAt: number; expiresAt: number } {
  return { availableAt: reservationStartsAt - 30 * 60_000, expiresAt: reservationStartsAt };
}

export type TokenRedemption = { ok: true } | { ok: false; reason: "not_yet_available" | "consumed" | "expired" };

export function redeemBriefToken(token: { expiresAt: number; consumedAt?: number }, reservationStartsAt: number, now: number = Date.now()): TokenRedemption {
  if (token.consumedAt !== undefined) return { ok: false, reason: "consumed" };
  if (now < reservationStartsAt - 30 * 60_000) return { ok: false, reason: "not_yet_available" };
  if (now > token.expiresAt) return { ok: false, reason: "expired" };
  return { ok: true };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
