/** In-memory data store. Production target: Prisma repositories (see prisma/schema.prisma). */
import { extractAssertions, type ClaimType } from "./assertions.js";

export interface Workspace { id: string; name: string }
export interface Page { id: string; workspaceId: string; parentId?: string; title: string; updatedAt: number }
export interface PageVersion { id: string; pageId: string; plainText: string; createdBy: string; createdAt: number }
export interface Assertion {
  id: string; workspaceId: string; pageId: string; versionId: string;
  text: string; claimType: ClaimType; numbers: number[]; tokens: string[]; negated: boolean;
}
export interface PageLink { id: string; workspaceId: string; sourcePageId: string; targetPageId: string; linkType: "explicit" | "contradiction" }
export interface WorkspaceAction { id: string; workspaceId: string; assigneeId: string; title: string; status: "open" | "done"; dueAt?: number; lastTouchedAt: number }
export type AlertType = "contradiction" | "stale" | "dormant_action";
export interface DocAlert { id: string; workspaceId: string; pageId?: string; alertType: AlertType; severity: "low" | "medium" | "high"; evidence: unknown; status: "open" | "dismissed"; dedupeKey: string }
export interface AuditRun { id: string; workspaceId: string; startedAt: number; completedAt: number; summary: { contradictions: number; stale: number; dormantActions: number; healthScore: number } }

export const db = {
  workspaces: new Map<string, Workspace>(),
  pages: new Map<string, Page>(),
  versions: new Map<string, PageVersion>(),
  assertions: new Map<string, Assertion>(),
  links: new Map<string, PageLink>(),
  actions: new Map<string, WorkspaceAction>(),
  alerts: new Map<string, DocAlert>(), // key: dedupeKey
  auditRuns: new Map<string, AuditRun>()
};

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
}

/** Replace page content with a new version and re-extract its assertions. */
export function upsertPageContent(page: Page, plainText: string, createdBy: string, now: number = Date.now()): PageVersion {
  const version: PageVersion = { id: nextId("ver"), pageId: page.id, plainText, createdBy, createdAt: now };
  db.versions.set(version.id, version);
  page.updatedAt = now;
  for (const [id, a] of db.assertions) if (a.pageId === page.id) db.assertions.delete(id);
  for (const extracted of extractAssertions(plainText)) {
    const assertion: Assertion = {
      id: nextId("asrt"), workspaceId: page.workspaceId, pageId: page.id, versionId: version.id,
      text: extracted.text, claimType: extracted.claimType, numbers: extracted.numbers, tokens: extracted.tokens, negated: extracted.negated
    };
    db.assertions.set(assertion.id, assertion);
  }
  return version;
}

export function latestVersion(pageId: string): PageVersion | undefined {
  return [...db.versions.values()].filter((v) => v.pageId === pageId).sort((a, b) => b.createdAt - a.createdAt)[0];
}

let seeded = false;
export function seed() {
  if (seeded) return;
  seeded = true;
  const now = Date.now();
  const DAY = 24 * 60 * 60_000;

  const ws: Workspace = { id: "ws_acme", name: "Acme Ops" };
  db.workspaces.set(ws.id, ws);

  const pricing: Page = { id: "page_pricing", workspaceId: ws.id, title: "Pricing", updatedAt: now };
  const faq: Page = { id: "page_pricing_faq", workspaceId: ws.id, title: "Pricing FAQ", updatedAt: now };
  const strategy: Page = { id: "page_strategy", workspaceId: ws.id, title: "2023 Strategy", updatedAt: now - 45 * DAY };
  for (const p of [pricing, faq, strategy]) db.pages.set(p.id, p);

  upsertPageContent(pricing, "Our Pro plan costs $20 per seat monthly. Annual billing saves 20% for teams.", "maya", now);
  upsertPageContent(faq, "The Pro plan costs $25 per seat. Trials last 14 days.", "sam", now);
  upsertPageContent(strategy, "In 2023 we will launch the enterprise tier and hire 3 account executives.", "maya", now - 45 * DAY);
  strategy.updatedAt = now - 45 * DAY; // keep the page old even though its version was written at seed time

  const action: WorkspaceAction = {
    id: nextId("act"), workspaceId: ws.id, assigneeId: "maya",
    title: "Follow up with design on onboarding flow", status: "open", lastTouchedAt: now - 20 * DAY
  };
  db.actions.set(action.id, action);
}
