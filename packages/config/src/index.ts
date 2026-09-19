import { z } from "zod";

export const baseEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  APP_BASE_URL: z.string().url().optional(),
  DATABASE_URL: z.string().optional()
});

export function parseEnv<T extends z.ZodRawShape>(shape: T, env: NodeJS.ProcessEnv = process.env) {
  return baseEnvSchema.extend(shape).parse(env);
}
