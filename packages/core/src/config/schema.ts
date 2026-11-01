import { z } from 'zod';

/**
 * Canonical shape of `.vibeguardrc.json`. Strict: unknown keys are a
 * configuration error rather than silently ignored input.
 */
export const vibeguardConfigSchema = z.strictObject({
  $schema: z.string().optional(),
  version: z.literal(1),
  scan: z
    .strictObject({
      exclude: z.array(z.string().min(1)).default([]),
    })
    .default({ exclude: [] }),
});

export type VibeGuardConfig = z.infer<typeof vibeguardConfigSchema>;

/**
 * The config VibeGuard applies when a project has no `.vibeguardrc.json`,
 * and the config `vibeguard init` writes (without `$schema` — VibeGuard
 * does not publish a schema URL yet, and a dead link is worse than none).
 */
export function defaultConfig(): VibeGuardConfig {
  return { version: 1, scan: { exclude: [] } };
}
