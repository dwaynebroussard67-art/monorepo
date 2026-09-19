/**
 * Moat: the Living Document audit engine.
 * Stateful alerts (not ephemeral AI comments) for contradictions, stale pages, and
 * dormant actions, plus a workspace health score. Alerts upsert by dedupe key so
 * re-running an audit never spam-duplicates.
 */
import { CONTRADICTION_THRESHOLD, contradictionScore, healthScore, isStaleContent } from "../../lib/assertions.js";
import { db, latestVersion, nextId, type AuditRun, type DocAlert } from "../../lib/store.js";

const DORMANT_AFTER_MS = 14 * 24 * 60 * 60_000;
const MAX_PAIRS = 500;

function upsertAlert(alert: Omit<DocAlert, "id" | "status">): DocAlert {
  const existing = db.alerts.get(alert.dedupeKey);
  if (existing) {
    existing.evidence = alert.evidence;
    existing.severity = alert.severity;
    existing.status = "open";
    return existing;
  }
  const created: DocAlert = { id: nextId("alert"), status: "open", ...alert };
  db.alerts.set(alert.dedupeKey, created);
  return created;
}

export function runWorkspaceAudit(workspaceId: string, now: number = Date.now()): AuditRun {
  const startedAt = now;
  const assertions = [...db.assertions.values()].filter((a) => a.workspaceId === workspaceId);
  const pages = [...db.pages.values()].filter((p) => p.workspaceId === workspaceId);
  const actions = [...db.actions.values()].filter((a) => a.workspaceId === workspaceId);

  let contradictions = 0;
  let stale = 0;
  let dormantActions = 0;

  // 1) pairwise contradiction scan (production: vector retrieval limits candidates)
  let pairs = 0;
  for (let i = 0; i < assertions.length && pairs < MAX_PAIRS; i++) {
    for (let j = i + 1; j < assertions.length && pairs < MAX_PAIRS; j++) {
      pairs++;
      const a = assertions[i]!;
      const b = assertions[j]!;
      const score = contradictionScore(
        { text: a.text, textNorm: a.text.toLowerCase(), claimType: a.claimType, numbers: a.numbers, tokens: a.tokens, negated: a.negated },
        { text: b.text, textNorm: b.text.toLowerCase(), claimType: b.claimType, numbers: b.numbers, tokens: b.tokens, negated: b.negated }
      );
      if (score < CONTRADICTION_THRESHOLD) continue;
      contradictions++;
      const [aId, bId] = [a.id, b.id].sort();
      const linkId = `lnk_contra_${aId}_${bId}`;
      db.links.set(linkId, { id: linkId, workspaceId, sourcePageId: a.pageId, targetPageId: b.pageId, linkType: "contradiction" });
      upsertAlert({
        workspaceId, pageId: a.pageId, alertType: "contradiction",
        severity: score >= 0.8 ? "high" : "medium",
        evidence: { score: Number(score.toFixed(2)), pageA: a.pageId, pageB: b.pageId, assertionA: a.text, assertionB: b.text },
        dedupeKey: `${workspaceId}:contradiction:${aId}|${bId}`
      });
    }
  }

  // 2) stale page scan
  for (const page of pages) {
    const version = latestVersion(page.id);
    if (!version) continue;
    const check = isStaleContent(version.plainText, page.updatedAt, now);
    if (!check.stale) continue;
    stale++;
    upsertAlert({
      workspaceId, pageId: page.id, alertType: "stale", severity: "low",
      evidence: { reason: check.reason, lastUpdated: new Date(page.updatedAt).toISOString(), title: page.title },
      dedupeKey: `${workspaceId}:stale:${page.id}`
    });
  }

  // 3) dormant actions
  for (const action of actions) {
    if (action.status === "done" || now - action.lastTouchedAt <= DORMANT_AFTER_MS) continue;
    dormantActions++;
    upsertAlert({
      workspaceId, alertType: "dormant_action", severity: "medium",
      evidence: { actionId: action.id, title: action.title, assigneeId: action.assigneeId, dormantDays: Math.floor((now - action.lastTouchedAt) / 86_400_000) },
      dedupeKey: `${workspaceId}:dormant:${action.id}`
    });
  }

  const summary = { contradictions, stale, dormantActions, healthScore: healthScore(contradictions, stale, dormantActions) };
  const run: AuditRun = { id: nextId("audit"), workspaceId, startedAt, completedAt: Date.now(), summary };
  db.auditRuns.set(run.id, run);
  return run;
}
