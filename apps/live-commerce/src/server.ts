import Fastify from "fastify";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { parseEnv } from "@killer-suite/config";
import { createLogger, requestId } from "@killer-suite/observability";
import type { HealthPayload } from "@killer-suite/contracts";
import { storeRoutes } from "./modules/store/routes.js";
import { cartRoutes } from "./modules/cart/routes.js";
import { streamRoutes } from "./modules/streams/routes.js";
import { seed } from "./lib/store.js";

export const SERVICE = "live-commerce";
export const VERSION = "0.1.0";

export async function buildServer() {
  seed();
  const logger = createLogger(SERVICE);
  const app = Fastify({ logger: false, genReqId: () => requestId() });

  app.get("/health", async (): Promise<HealthPayload> => ({ ok: true, service: SERVICE, version: VERSION }));

  await app.register(storeRoutes);
  await app.register(cartRoutes);
  await app.register(streamRoutes);

  app.addHook("onResponse", async (req, reply) => {
    logger.info("request", { id: req.id, method: req.method, url: req.url, status: reply.statusCode });
  });
  return app;
}

export async function start() {
  const env = parseEnv({ PORT: z.coerce.number().int().positive().default(4001) });
  const app = await buildServer();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  createLogger(SERVICE).info("listening", { port: env.PORT });
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
