/**
 * Detected technology stack of a scanned project. Phase 0 defines the
 * contract; the project-intelligence module (Phase 1) populates it.
 */
export interface ProjectInfo {
  /** Absolute path to the detected project root. */
  readonly root: string;
  /** Human-readable project name from package.json. */
  readonly name: string;
  /** Source language(s) present. */
  readonly languages: readonly ('javascript' | 'typescript')[];
  /** Detected frameworks; empty when none recognized. */
  readonly frameworks: readonly string[];
  /** Package manager in use: npm, pnpm, yarn, or bun. */
  readonly packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun';
  /** Dependency names declared in package.json. */
  readonly dependencies: readonly string[];
  /** Script name → command, from package.json. */
  readonly scripts: Readonly<Record<string, string>>;
  /** Source files in the scan scope, POSIX-style relative paths. */
  readonly files: readonly string[];
  /**
   * Entry-point candidates, POSIX-style relative paths: package.json
   * `main` / `module` fields plus conventional candidates verified to
   * exist in the file index.
   */
  readonly entryPoints: readonly string[];
  /**
   * Known tool/config files present in the scanned project (e.g.
   * `tsconfig.json`, `vite.config.ts`), POSIX-style relative paths.
   */
  readonly configFiles: readonly string[];
}
