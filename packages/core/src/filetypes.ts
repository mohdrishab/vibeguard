/**
 * File-kind predicates shared by language detection, the file index, and
 * the analyzer engines. One source of truth for what "a JavaScript-like
 * file" means across packages.
 */

/** `.ts`, `.tsx`, `.mts`, `.cts` — files the TypeScript compiler owns. */
const TYPESCRIPT_EXTENSIONS = /\.(ts|tsx|mts|cts)$/u;

/** `.js`, `.jsx`, `.mjs`, `.cjs` — plain JavaScript files. */
const JAVASCRIPT_EXTENSIONS = /\.(js|jsx|mjs|cjs)$/u;

/** True for files the TypeScript compiler can process (including d.ts). */
export function isTypeScriptFile(relativePath: string): boolean {
  return TYPESCRIPT_EXTENSIONS.test(relativePath);
}

/**
 * True for plain JavaScript files: the ESLint engine's default-scope
 * candidates. TS files are also lintable, see
 * {@link isLintableFile}.
 */
export function isJavaScriptLikeFile(relativePath: string): boolean {
  return JAVASCRIPT_EXTENSIONS.test(relativePath);
}

/** True for any file VibeGuard's lint engine can parse and check. */
export function isLintableFile(relativePath: string): boolean {
  return isTypeScriptFile(relativePath) || isJavaScriptLikeFile(relativePath);
}
