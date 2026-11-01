import fg from 'fast-glob';

import { isSensitiveFile } from './secrets.js';
import { toPosix } from '../utils.js';

/**
 * Directories that are never scanned — build output, vendored code,
 * version control internals, and VibeGuard's own runtime directory.
 */
export const DEFAULT_EXCLUDES: readonly string[] = Object.freeze([
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/.turbo/**',
  '**/.cache/**',
  '**/.vibeguard/**',
]);

export interface IndexFilesOptions {
  /** Absolute project root. */
  readonly root: string;
  /** Extra glob excludes from `.vibeguardrc.json` (e.g. `src/generated/**`). */
  readonly extraExcludes?: readonly string[];
}

export interface IndexResult {
  /** Files in scan scope, POSIX-style paths relative to `root`, sorted. */
  readonly files: readonly string[];
  /**
   * Sensitive files discovered but excluded by policy. Names only —
   * contents are never read.
   */
  readonly excludedSensitiveFiles: readonly string[];
}

/**
 * Builds the project file index: every file in scan scope, respecting
 * default excludes, user excludes, and the sensitive-file policy.
 * Symbolic links are never followed, so symlink loops cannot hang a scan.
 */
export async function indexFiles(options: IndexFilesOptions): Promise<IndexResult> {
  const { root, extraExcludes = [] } = options;
  if (extraExcludes.some((pattern) => pattern.trim() === '')) {
    throw new RangeError('Empty exclude patterns are not allowed');
  }

  const found = await fg('**/*', {
    cwd: root,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: [...DEFAULT_EXCLUDES, ...extraExcludes],
  });

  const kept: string[] = [];
  const skipped: string[] = [];
  for (const entry of found) {
    if (isSensitiveFile(entry)) {
      skipped.push(entry);
    } else {
      kept.push(toPosix(entry));
    }
  }
  kept.sort();
  skipped.sort();
  return { files: kept, excludedSensitiveFiles: skipped };
}
