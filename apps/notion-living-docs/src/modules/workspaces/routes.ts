import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, latestVersion, nextId, upsertPageContent, type Page } from "../../lib/store.js";
import { runWorkspaceAudit } from "../living-docs/engine.js";

const createWorkspaceSchema = z.object({ name: z.string().min(1) });
const createPageSchema = z.object({ title: z.string().min(1), parentId: z.string().optional(), content: z.string().default("") });
const contentSchema = z.object({ plainText: z.string().min(1).max(500_000), createdBy: z.string().min(1) });
const actionSchema = z.object({ title: z.string().min(1), assigneeId: z.string().min(1), dueAt: z.number().int().positive().optional() });
const actionPatchSchema = z.object({ status: z.enum(["open", "done"]) });

export async function workspaceRoutes(app: FastifyInstance) {
  app.get("/workspaces", async () => ({ ok: true as const, data: [...db.workspaces.values()] }));

  app.post("/workspaces", async (req, reply) => {
    const parsed = createWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const ws = { id: nextId("ws"), ...parsed.data };
    db.workspaces.set(ws.id, ws);
    return reply.code(201).send({ ok: true, data: ws });
  });

  app.post("/workspaces/:workspaceId/pages", async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!db.workspaces.has(workspaceId)) return reply.code(404).send({ ok: false, error: "workspace_not_found" });
    const parsed = createPageSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const page: Page = { id: nextId("page"), workspaceId, title: parsed.data.title, parentId: parsed.data.parentId, updatedAt: Date.now() };
    db.pages.set(page.id, page);
    if (parsed.data.content) upsertPageContent(page, parsed.data.content, "system");
    return reply.code(201).send({ ok: true, data: page });
  });

  app.get("/workspaces/:workspaceId/pages", async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!db.workspaces.has(workspaceId)) return reply.code(404).send({ ok: false, error: "workspace_not_found" });
    const pages = [...db.pages.values()].filter((p) => p.workspaceId === workspaceId)
      .map((p) => ({ ...p, currentVersion: latestVersion(p.id)?.plainText ?? "" }));
    return { ok: true, data: pages };
  });

  /** New version triggers assertion re-extraction AND an audit run (blueprint: version-triggered indexing). */
  app.put("/pages/:pageId/content", async (req, reply) => {
    const { pageId } = req.params as { pageId: string };
    const page = db.pages.get(pageId);
    if (!page) return reply.code(404).send({ ok: false, error: "page_not_found" });
    const parsed = contentSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const version = upsertPageContent(page, parsed.data.plainText, parsed.data.createdBy);
    const audit = runWorkspaceAudit(page.workspaceId);
    return { ok: true, data: { version: { id: version.id, createdAt: version.createdAt }, assertions: [...db.assertions.values()].filter((a) => a.pageId === page.id).length, audit: audit.summary } };
  });

  app.post("/workspaces/:workspaceId/actions", async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!db.workspaces.has(workspaceId)) return reply.code(404).send({ ok: false, error: "workspace_not_found" });
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const action = { id: nextId("act"), workspaceId, status: "open" as const, lastTouchedAt: Date.now(), ...parsed.data };
    db.actions.set(action.id, action);
    return reply.code(201).send({ ok: true, data: action });
  });

  app.patch("/actions/:actionId", async (req, reply) => {
    const { actionId } = req.params as { actionId: string };
    const action = db.actions.get(actionId);
    if (!action) return reply.code(404).send({ ok: false, error: "action_not_found" });
    const parsed = actionPatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    action.status = parsed.data.status;
    action.lastTouchedAt = Date.now();
    return { ok: true, data: action };
  });

  app.post("/workspaces/:workspaceId/audit", async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!db.workspaces.has(workspaceId)) return reply.code(404).send({ ok: false, error: "workspace_not_found" });
    return { ok: true, data: runWorkspaceAudit(workspaceId) };
  });

  app.get("/workspaces/:workspaceId/alerts", async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!db.workspaces.has(workspaceId)) return reply.code(404).send({ ok: false, error: "workspace_not_found" });
    return { ok: true, data: [...db.alerts.values()].filter((a) => a.workspaceId === workspaceId && a.status === "open") };
  });

  app.get("/workspaces/:workspaceId/health", async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    const run = [...db.auditRuns.values()].filter((r) => r.workspaceId === workspaceId).at(-1);
    if (!run) return reply.code(400).send({ ok: false, error: "no_audit_run_post_audit_first" });
    return { ok: true, data: run.summary };
  });
}
