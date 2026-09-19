import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, nextId } from "../../lib/store.js";

const linkSchema = z.object({ targetPageId: z.string().min(1) });

export async function linkRoutes(app: FastifyInstance) {
  app.post("/pages/:pageId/links", async (req, reply) => {
    const { pageId } = req.params as { pageId: string };
    const source = db.pages.get(pageId);
    if (!source) return reply.code(404).send({ ok: false, error: "page_not_found" });
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    const target = db.pages.get(parsed.data.targetPageId);
    if (!target) return reply.code(404).send({ ok: false, error: "target_page_not_found" });
    if (target.workspaceId !== source.workspaceId) return reply.code(409).send({ ok: false, error: "cross_workspace_link_denied" });
    if (target.id === source.id) return reply.code(400).send({ ok: false, error: "self_link_not_allowed" });
    const exists = [...db.links.values()].some((l) => l.linkType === "explicit" && l.sourcePageId === source.id && l.targetPageId === target.id);
    if (exists) return reply.code(409).send({ ok: false, error: "link_exists" });
    const link = { id: nextId("lnk"), workspaceId: source.workspaceId, sourcePageId: source.id, targetPageId: target.id, linkType: "explicit" as const };
    db.links.set(link.id, link);
    return reply.code(201).send({ ok: true, data: link });
  });

  /** Knowledge graph view: pages as nodes, explicit links + contradiction edges as edges. */
  app.get("/workspaces/:workspaceId/graph", async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!db.workspaces.has(workspaceId)) return reply.code(404).send({ ok: false, error: "workspace_not_found" });
    const nodes = [...db.pages.values()].filter((p) => p.workspaceId === workspaceId).map((p) => ({ id: p.id, title: p.title }));
    const edges = [...db.links.values()].filter((l) => l.workspaceId === workspaceId)
      .map((l) => ({ source: l.sourcePageId, target: l.targetPageId, type: l.linkType }));
    return { ok: true, data: { nodes, edges } };
  });
}
