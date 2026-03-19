import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive(),
  DATABASE_URL: z.string().min(1),
  ARTIFACT_ROOT: z.string().min(1),
  CHROME_PATH: z.string().min(1),
});

export type WebPerfEnv = z.infer<typeof envSchema>;

export function parseEnv(input: Record<string, string | undefined>): WebPerfEnv
{
  return envSchema.parse(input);
}
