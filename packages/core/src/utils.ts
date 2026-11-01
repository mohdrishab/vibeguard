import { access, constants } from 'node:fs/promises';
import path from 'node:path';

/**
 * True when a file or directory exists on disk.
 */
export async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes a path for consistency in reports, issues, and file indexes:
 * always POSIX-style forward slashes and relative (never absolute).
 */
export function toPosix(p: string): string {
  return p.replaceAll(path.sep, '/').replace(/\\/g, '/');
}

/**
 * Narrow type guard for plain (non-array, non-null) objects.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
