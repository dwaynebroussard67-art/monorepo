/**
 * Moat support: turn versioned page text into machine-comparable assertions.
 * Scaffold heuristic (deterministic, testable). Production: claim extractor +
 * embeddings + a trained contradiction classifier (blueprint §4).
 */

export type ClaimType = "metric" | "date" | "statement";

export interface ExtractedAssertion {
  text: string;
  textNorm: string;
  claimType: ClaimType;
  numbers: number[];
  tokens: string[];
  negated: boolean;
}

const STOPWORDS = new Set([
  "the","a","an","of","to","in","on","for","and","or","is","are","was","were","be","been",
  "by","with","we","our","it","its","this","that","per","at","as","from","will","would","can","not"
]);

export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 10);
}

export function extractAssertions(text: string): ExtractedAssertion[] {
  return splitSentences(text)
    .map((sentence) => {
      const lower = sentence.toLowerCase();
      const numbers = [...lower.matchAll(/\$?(\d+(?:\.\d+)?)\s*(%|k|m|percent|x)?/g)].map((m) => {
        const base = parseFloat(m[1]!);
        const unit = m[2];
        return unit === "k" ? base * 1_000 : unit === "m" ? base * 1_000_000 : base;
      });
      const claimType: ClaimType = numbers.length > 0 ? "metric" : /\b(19|20)\d{2}\b/.test(lower) ? "date" : "statement";
      const tokens = lower.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOPWORDS.has(t));
      const negated = /\b(not|no|never|isn't|don't|won't|cannot|without)\b/.test(lower);
      return { text: sentence, textNorm: lower, claimType, numbers, tokens: [...new Set(tokens)], negated };
    })
    .filter((a) => a.tokens.length >= 2);
}

export function tokenOverlap(a: string[], b: string[]): string[] {
  const sb = new Set(b);
  return a.filter((t) => sb.has(t));
}

export const CONTRADICTION_THRESHOLD = 0.55;

/**
 * Contradiction score in [0, ~1). Requires shared subject matter (>=3 overlapping tokens),
 * then detects numeric conflicts on the same subject or polarity flips with equal numbers.
 */
export function contradictionScore(a: ExtractedAssertion, b: ExtractedAssertion): number {
  if (a.textNorm === b.textNorm) return 0;
  const shared = tokenOverlap(a.tokens, b.tokens);
  if (shared.length < 3) return 0;
  let score = 0;
  const bothNumeric = a.numbers.length > 0 && b.numbers.length > 0;
  if (bothNumeric) {
    const sameNumbers = a.numbers.length === b.numbers.length && a.numbers.every((n, i) => n === b.numbers[i]);
    if (!sameNumbers) score = Math.max(score, 0.55);
    else if (a.negated !== b.negated) score = Math.max(score, 0.5);
  } else if (a.negated !== b.negated) {
    score = Math.max(score, 0.45);
  }
  if (score === 0) return 0;
  return Math.min(0.98, score + 0.05 * Math.min(5, shared.length - 3));
}

export function isStaleContent(text: string, updatedAt: number, now: number = Date.now()): { stale: boolean; reason?: "not_updated_30d" | "mentions_past_year" } {
  const THIRTY_DAYS = 30 * 24 * 60 * 60_000;
  if (now - updatedAt > THIRTY_DAYS) return { stale: true, reason: "not_updated_30d" };
  const currentYear = new Date(now).getUTCFullYear();
  const pastYear = [...text.matchAll(/\b((?:19|20)\d{2})\b/g)].map((m) => parseInt(m[1]!, 10)).some((y) => y < currentYear);
  if (pastYear) return { stale: true, reason: "mentions_past_year" };
  return { stale: false };
}

export function healthScore(contradictions: number, stale: number, dormant: number): number {
  return Math.max(0, 100 - 15 * contradictions - 8 * stale - 5 * dormant);
}
