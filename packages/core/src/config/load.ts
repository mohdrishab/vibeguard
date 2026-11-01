import { access, constants, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { VibeGuardError } from '../errors.js';
import { isRecord } from '../utils.js';
import { vibeguardConfigSchema } from './schema.js';
import type { VibeGuardConfig } from './schema.js';

export const CONFIG_FILE_NAME = '.vibeguardrc.json';

export interface ResolvedConfig {
  /** Absolute path of the loaded config file. */
  readonly path: string;
  /** Parsed, schema-validated config. */
  readonly config: VibeGuardConfig;
  /** Original file text (secrets must never be stored here by callers). */
  readonly rawText: string;
}

interface NodeError extends Error {
  readonly code?: string;
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    isRecord(error) &&
    (error as NodeError).code === code
  );
}

/**
 * Loads `<root>/.vibeguardrc.json`.
 *
 * @returns `null` when no config file exists — the caller applies
 *   {@link defaultConfig}.
 * @throws {VibeGuardError} `INVALID_CONFIG` when the file exists but is
 *   unreadable, not JSON, or fails schema validation.
 */
export async function loadConfig(root: string): Promise<ResolvedConfig | null> {
  const configPath = path.join(path.resolve(root), CONFIG_FILE_NAME);
  let text: string;
  try {
    text = await readFile(configPath, 'utf8');
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return null;
    }
    throw new VibeGuardError(
      'INVALID_CONFIG',
      `${CONFIG_FILE_NAME} at ${configPath} could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new VibeGuardError('INVALID_CONFIG', `${CONFIG_FILE_NAME} is not valid JSON: ${message}`);
  }

  const parsed = vibeguardConfigSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new VibeGuardError('INVALID_CONFIG', `${CONFIG_FILE_NAME} is invalid: ${issues}`);
  }

  return { path: configPath, config: parsed.data, rawText: text };
}

export interface WriteConfigOptions {
  /** Project root the config file is written into. */
  readonly root: string;
  readonly config: VibeGuardConfig;
  /** Overwrite an existing config file. Off by default. */
  readonly force?: boolean;
}

/** Serializes a config to stable file text (2-space JSON + trailing NL). */
export function serializeConfig(config: VibeGuardConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * Writes `.vibeguardrc.json` into `<root>`.
 *
 * Uncommitted user changes are never clobbered: without {@link WriteConfigOptions.force}
 * an existing file aborts with `CONFIG_EXISTS`, enforced atomically via
 * exclusive create (`wx`).
 *
 * @returns The absolute path that was written.
 * @throws {VibeGuardError} `CONFIG_EXISTS` without force, `INVALID_CONFIG`
 *   on write failure, `NO_PROJECT` when the root directory is missing.
 */
export async function writeConfig(options: WriteConfigOptions): Promise<string> {
  const { root, config, force = false } = options;
  const target = path.join(path.resolve(root), CONFIG_FILE_NAME);

  // Root must be an existing directory; guard explicitly for a clear error
  // instead of a bare ENOENT from writeFile.
  if (force) {
    // With force, a missing root must still fail loudly.
    try {
      await access(path.dirname(target), constants.F_OK);
    } catch {
      throw new VibeGuardError('NO_PROJECT', `Directory ${path.dirname(target)} does not exist.`);
    }
  }

  try {
    await writeFile(target, serializeConfig(config), { flag: force ? 'w' : 'wx' });
  } catch (error) {
    if (!force && isNodeError(error, 'EEXIST')) {
      throw new VibeGuardError(
        'CONFIG_EXISTS',
        `${CONFIG_FILE_NAME} already exists at ${target}. ` +
          'User config is never overwritten without force (CLI: --force).',
      );
    }
    if (isNodeError(error, 'ENOENT')) {
      throw new VibeGuardError('NO_PROJECT', `Directory ${path.dirname(target)} does not exist.`);
    }
    throw new VibeGuardError(
      'INVALID_CONFIG',
      `Failed to write ${CONFIG_FILE_NAME}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return target;
}
