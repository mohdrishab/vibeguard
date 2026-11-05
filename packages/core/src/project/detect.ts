import path from 'node:path';

import { pathExists } from '../utils.js';
import { isJavaScriptLikeFile, isTypeScriptFile } from '../filetypes.js';
import { VibeGuardError } from '../errors.js';
import type { PackageJsonLite } from '../packagejson.js';
import type { ProjectInfo } from '../project.js';

const PROJECT_INDICATOR_FILE = 'package.json';

const PACKAGE_MANAGER_NAMES: readonly string[] = ['npm', 'pnpm', 'yarn', 'bun'];

/** Lockfile → package manager, in priority order (highest first). */
const LOCKFILE_INDICATORS: ReadonlyArray<readonly [string, ProjectInfo['packageManager']]> =
  Object.freeze([
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ]);

/**
 * Detects the project root by walking upward from `startDir` to the
 * nearest directory containing a package.json.
 *
 * Explicit directories passed by users on the command line are never
 * resolved this way — callers choose {@link requireProjectJsonDir} there —
 * because silently adopting an ancestor package.json is exactly the
 * "vibeguard init'd in my home directory" foot-gun.
 *
 * @throws {VibeGuardError} `NO_PROJECT` when no ancestor has a package.json.
 */
export async function findProjectRoot(startDir: string = process.cwd()): Promise<string> {
  let dir = path.resolve(startDir);
  for (;;) {
    if (await pathExists(path.join(dir, PROJECT_INDICATOR_FILE))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new VibeGuardError(
        'NO_PROJECT',
        `No package.json found in ${startDir} or any parent directory. ` +
          'Run VibeGuard inside a JavaScript/TypeScript project.',
      );
    }
    dir = parent;
  }
}

/**
 * Root must contain a package.json — used when the user names the
 * directory explicitly on the command line (no ancestor walking).
 *
 * @throws {VibeGuardError} `NO_PROJECT` when missing.
 */
export async function requireProjectJsonDir(dir: string): Promise<string> {
  const root = path.resolve(dir);
  if (!(await pathExists(path.join(root, PROJECT_INDICATOR_FILE)))) {
    throw new VibeGuardError(
      'NO_PROJECT',
      `${root} does not contain a package.json file. ` +
        'Point VibeGuard at a JavaScript/TypeScript project root.',
    );
  }
  return root;
}

/**
 * Parses a package.json `packageManager` field value
 * (`"pnpm@12.16.1"`) into the manager name.
 */
export function parsePackageManagerField(
  value: string | undefined,
): ProjectInfo['packageManager'] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const match = /^([a-z]+)@/.exec(value.trim());
  const name = match?.[1];
  if (name === undefined) {
    return undefined;
  }
  return PACKAGE_MANAGER_NAMES.includes(name) ? (name as ProjectInfo['packageManager']) : undefined;
}

/**
 * Detects the package manager: the `packageManager` field wins, then
 * lockfiles in priority order, defaulting to npm.
 */
export async function detectPackageManager(
  root: string,
  pkg: PackageJsonLite,
): Promise<ProjectInfo['packageManager']> {
  const fromField = parsePackageManagerField(pkg.packageManager);
  if (fromField !== undefined) {
    return fromField;
  }
  for (const [lockfile, manager] of LOCKFILE_INDICATORS) {
    if (await pathExists(path.join(root, lockfile))) {
      return manager;
    }
  }
  return 'npm';
}

/**
 * Language families present in the indexed files, primary first. A pure
 * TypeScript project still lists JavaScript when tooling files
 * (e.g. eslint.config.mjs) exist — the ordering conveys the primary
 * language.
 */
export function detectLanguages(files: readonly string[]): ProjectInfo['languages'] {
  let typescriptCount = 0;
  let javascriptCount = 0;
  for (const file of files) {
    if (isTypeScriptFile(file)) {
      typescriptCount += 1;
    } else if (isJavaScriptLikeFile(file)) {
      javascriptCount += 1;
    }
  }
  const counts: Readonly<Record<'typescript' | 'javascript', number>> = {
    typescript: typescriptCount,
    javascript: javascriptCount,
  };
  const languages: ('typescript' | 'javascript')[] = [];
  if (typescriptCount > 0) {
    languages.push('typescript');
  }
  if (javascriptCount > 0) {
    languages.push('javascript');
  }
  // Sorted on a copy (import order list is tiny): count-ascending reverse
  // sort, alphabetical tiebreak. Plain .sort() keeps the ES2022 lib target.
  return [...languages].sort((a, b) => {
    const diff = counts[b] - counts[a];
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}

/**
 * Server-side framework dependencies that mark a project as a Node.js
 * backend, not a frontend-only bundle.
 */
const BACKEND_FRAMEWORK_DEPS: readonly string[] = Object.freeze([
  'express',
  'fastify',
  'koa',
  '@nestjs/core',
  '@hapi/hapi',
  'hono',
  'restify',
  'socket.io',
  '@apollo/server',
  'apollo-server',
  'graphql-yoga',
  'nuxt',
  '@nuxt/kit',
]);

/**
 * Frameworks detected from declared dependencies. Deterministic order:
 * React, Next.js, Vite, Node.js.
 */
export function detectFrameworks(pkg: PackageJsonLite): readonly string[] {
  const deps = new Set<string>([
    ...Object.keys(pkg.dependencies),
    ...Object.keys(pkg.devDependencies),
    ...Object.keys(pkg.optionalDependencies),
  ]);
  const usesNodeDirectly = Object.values(pkg.scripts).some((command) =>
    /(^|[\s=./"'])node(\s|$)/u.test(command),
  );
  if (deps.has('node') || BACKEND_FRAMEWORK_DEPS.some((d) => deps.has(d)) || usesNodeDirectly) {
    return ['Node.js'];
  }
  const frameworks: string[] = [];
  if (deps.has('react')) {
    frameworks.push('React');
  }
  if (deps.has('next')) {
    frameworks.push('Next.js');
  }
  if (deps.has('vite')) {
    frameworks.push('Vite');
  }
  return frameworks;
}
