import { defaultConfig, loadConfig } from '@closed-door/core';

import type { Io } from '../io.js';
import { Glyphs } from '../ui/format.js';

export interface ConfigArgs {
  /** Absolute project root (already resolved by the CLI wiring). */
  readonly root: string;
  /** Machine-readable output instead of the human summary. */
  readonly json: boolean;
}

export interface ConfigResult {
  readonly found: boolean;
  readonly path: string | null;
  readonly config: ReturnType<typeof defaultConfig>;
}

/**
 * `vibeguard config`: report the resolved configuration. A missing config
 * is a valid, honest state — defaults apply — clearly labeled as such.
 *
 * @throws {VibeGuardError} `INVALID_CONFIG` when a config exists but is
 *   malformed (propagated from {@link loadConfig}).
 */
export async function runConfig(io: Io, args: ConfigArgs): Promise<ConfigResult> {
  const resolved = await loadConfig(args.root);
  const result: ConfigResult =
    resolved === null
      ? { found: false, path: null, config: defaultConfig() }
      : { found: true, path: resolved.path, config: resolved.config };

  if (args.json) {
    io.log(JSON.stringify({ ok: true, command: 'config', ...result }, null, 2));
    return result;
  }

  if (resolved === null) {
    io.log(
      `${Glyphs.notice} No .vibeguardrc.json found under ${args.root}` +
        ' — default config applies:',
    );
  } else {
    io.log(`${Glyphs.success} Config loaded: ${resolved.path}`);
  }
  io.log(JSON.stringify(result.config, null, 2));
  return result;
}
