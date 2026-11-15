import { findProjectRoot, requireProjectJsonDir, VibeGuardError } from '@closed-door/core';

import type { Io } from '../io.js';

/**
 * Resolves the project root a command operates on.
 *
 * - No directory argument (implicit cwd): walk to the nearest ancestor
 *   containing package.json.
 * - Explicit directory argument: package.json must exist in that exact
 *   directory (no ancestor walk — adopting an unexpected ancestor
 *   manifest is exactly the `vibeguard scar in ~` foot-gun).
 *
 * @throws {VibeGuardError} `NO_PROJECT` per the rules above.
 */
export async function resolveCommandRoot(dir: string | undefined): Promise<string> {
  return dir === undefined ? findProjectRoot() : requireProjectJsonDir(dir);
}

/** Renders any error for CLI output; structured codes when available. */
export function describeError(error: unknown): string {
  if (error instanceof VibeGuardError) {
    return `[${error.code}] ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Runs a command action, mapping failures to stderr and exit code 1
 * instead of an unhandled rejection.
 */
export async function runAction(io: Io, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error: unknown) {
    io.error(describeError(error));
    process.exitCode = 1;
  }
}
