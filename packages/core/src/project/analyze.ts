import path from 'node:path';

import { allDependencyNames, parsePackageJson } from '../packagejson.js';
import type { ProjectInfo } from '../project.js';
import { detectFrameworks, detectLanguages, detectPackageManager } from './detect.js';
import { indexFiles } from './files.js';

/**
 * Conventional entry points checked against the file index after the
 * manifest's explicit `main` / `module` fields. First match wins; the
 * list is ordered by likelihood for typical JS/TS layouts.
 */
const CONVENTIONAL_ENTRY_POINTS: readonly string[] = Object.freeze([
  'src/index.ts',
  'src/index.tsx',
  'src/index.js',
  'src/index.jsx',
  'src/main.ts',
  'src/main.tsx',
  'src/main.js',
  'index.ts',
  'index.js',
  'app.ts',
  'app.js',
  'server.ts',
  'server.js',
]);

/**
 * Config/tool files worth surfacing in project intelligence. Only files
 * actually present in the index are reported.
 */
const KNOWN_CONFIG_FILES: readonly string[] = Object.freeze([
  'tsconfig.json',
  'tsconfig.node.json',
  'jsconfig.json',
  'vite.config.ts',
  'vite.config.js',
  'next.config.js',
  'next.config.mjs',
  'nuxt.config.ts',
  'vitest.config.ts',
  'eslint.config.js',
  'eslint.config.mjs',
  'prettier.config.js',
  'turbo.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
]);

export interface AnalyzeOptions {
  /** Extra excludes from user config (glob patterns). */
  readonly exclude?: readonly string[];
}

export interface AnalyzeResult {
  /** Frozen project intelligence. */
  readonly project: ProjectInfo;
  /** Sensitive files discovered but never read, POSIX relative paths. */
  readonly excludedSensitiveFiles: readonly string[];
}

function freezeProject(project: ProjectInfo): ProjectInfo {
  return Object.freeze({
    ...project,
    languages: Object.freeze(project.languages),
    frameworks: Object.freeze(project.frameworks),
    dependencies: Object.freeze(project.dependencies),
    scripts: Object.freeze(project.scripts),
    files: Object.freeze(project.files),
    entryPoints: Object.freeze(project.entryPoints),
    configFiles: Object.freeze(project.configFiles),
  });
}

function resolveEntryPoints(
  main: string | undefined,
  moduleField: string | undefined,
  files: ReadonlySet<string>,
): string[] {
  const candidates: string[] = [];
  for (const manifestField of [moduleField, main]) {
    if (manifestField === undefined) {
      continue;
    }
    // Manifest values are package-root-relative module specifiers; strip a
    // leading './' so they compare cleanly against relative index paths.
    const normalized = manifestField.replace(/^\.\//u, '');
    if (files.has(normalized)) {
      candidates.push(normalized);
    }
  }
  for (const candidate of CONVENTIONAL_ENTRY_POINTS) {
    if (files.has(candidate)) {
      candidates.push(candidate);
    }
  }
  return [...new Set(candidates)];
}

function resolveConfigFiles(files: ReadonlySet<string>): string[] {
  return KNOWN_CONFIG_FILES.filter((entry) => files.has(entry));
}

/**
 * Runs the full project-intelligence pass: validate the root, read the
 * manifest, index files, detect languages/frameworks/package manager,
 * and resolve entry points and config inventory.
 *
 * @throws {VibeGuardError} `NO_PROJECT` when `<root>/package.json` is
 *   missing, `INVALID_PACKAGE_JSON` when it cannot be parsed.
 */
export async function analyzeProjectDetailed(
  root: string,
  options: AnalyzeOptions = {},
): Promise<AnalyzeResult> {
  const projectRoot = path.resolve(root);
  const pkg = await parsePackageJson(projectRoot);
  const { files, excludedSensitiveFiles } = await indexFiles({
    root: projectRoot,
    extraExcludes: options.exclude,
  });

  const fileSet = new Set(files);
  const projectName = pkg.name ?? path.basename(projectRoot);

  const project: ProjectInfo = {
    root: projectRoot,
    name: projectName,
    languages: detectLanguages(files),
    frameworks: detectFrameworks(pkg),
    packageManager: await detectPackageManager(projectRoot, pkg),
    dependencies: allDependencyNames(pkg),
    scripts: pkg.scripts,
    files,
    entryPoints: resolveEntryPoints(pkg.main, pkg.module, fileSet),
    configFiles: resolveConfigFiles(fileSet),
  };

  return {
    project: freezeProject(project),
    excludedSensitiveFiles: Object.freeze(excludedSensitiveFiles),
  };
}

/**
 * Convenience wrapper returning only the frozen {@link ProjectInfo}.
 *
 * @throws {VibeGuardError} same as {@link analyzeProjectDetailed}.
 */
export async function analyzeProject(
  root: string,
  options: AnalyzeOptions = {},
): Promise<ProjectInfo> {
  const result = await analyzeProjectDetailed(root, options);
  return result.project;
}
