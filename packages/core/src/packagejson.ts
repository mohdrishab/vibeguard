import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { VibeGuardError } from './errors.js';
import { isRecord } from './utils.js';

/**
 * The subset of package.json that VibeGuard relies on. Parsed defensively:
 * real-world manifests are messy and missing fields must never crash a scan.
 */
export interface PackageJsonLite {
  readonly name?: string;
  readonly version?: string;
  readonly packageManager?: string;
  readonly type?: 'commonjs' | 'module';
  readonly main?: string;
  readonly module?: string;
  readonly scripts: Readonly<Record<string, string>>;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
  readonly optionalDependencies: Readonly<Record<string, string>>;
  readonly raw: Readonly<Record<string, unknown>>;
}

/** Parses and coerces an unknown value into a manifest-like record. */
export function normalizePackageJson(raw: unknown): PackageJsonLite {
  if (!isRecord(raw)) {
    throw new VibeGuardError('INVALID_PACKAGE_JSON', 'package.json must contain a JSON object');
  }
  const stringMap = (value: unknown): Record<string, string> => {
    if (!isRecord(value)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, v] of Object.entries(value)) {
      if (typeof v === 'string') {
        out[key] = v;
      }
    }
    return out;
  };
  const stringField = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() !== '' ? value : undefined;

  const type = raw['type'];

  return {
    name: stringField(raw['name']),
    version: stringField(raw['version']),
    packageManager: stringField(raw['packageManager']),
    type: type === 'module' || type === 'commonjs' ? type : undefined,
    main: stringField(raw['main']),
    module: stringField(raw['module']),
    scripts: stringMap(raw['scripts']),
    dependencies: stringMap(raw['dependencies']),
    devDependencies: stringMap(raw['devDependencies']),
    optionalDependencies: stringMap(raw['optionalDependencies']),
    raw,
  };
}

/**
 * Reads and normalizes `<root>/package.json`.
 *
 * @throws {VibeGuardError} `NO_PROJECT` when the file is missing,
 *   `INVALID_PACKAGE_JSON` when it is unreadable or not a JSON object.
 */
export async function parsePackageJson(root: string): Promise<PackageJsonLite> {
  const file = path.join(root, 'package.json');
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    throw new VibeGuardError(
      'NO_PROJECT',
      `No package.json found at ${root}. VibeGuard requires a Node.js project.`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new VibeGuardError(
      'INVALID_PACKAGE_JSON',
      `package.json at ${root} is not valid JSON: ${message}`,
    );
  }
  return normalizePackageJson(json);
}

/** All dependency names declared by the manifest, de-duplicated. */
export function allDependencyNames(pkg: PackageJsonLite): readonly string[] {
  const names = new Set<string>();
  for (const map of [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies]) {
    for (const name of Object.keys(map)) {
      names.add(name);
    }
  }
  return [...names].sort();
}
