import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Test-only filesystem fixtures. Excluded from the published build
 * (`tsconfig.json` excludes `src/testing/**`); imported by *.test.ts
 * files only.
 */

export interface TestProject {
  readonly root: string;
  /** Removes the temp project and everything under it. */
  dispose: () => Promise<void>;
}

/**
 * Creates a deterministic temporary project: every entry of
 * {@link TestProjectOptions.files} is written at `<root>/<relative path>`,
 * parent directories auto-created. Paths are POSIX-style relative
 * segments (e.g. `'src/index.ts'`).
 */
export async function createTestProject(
  files: Readonly<Record<string, string>>,
): Promise<TestProject> {
  const root = await mkdtemp(path.join(tmpdir(), 'vibeguard-test-'));
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, ...relative.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return {
    root,
    dispose: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** Serializes fields into formatted package.json text. */
export function packageJsonText(fields: Readonly<Record<string, unknown>>): string {
  return `${JSON.stringify(fields, null, 2)}\n`;
}

/** Stable minimal manifest for fixture projects. */
export function minimalPackageJson(
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    name: 'fixture-project',
    version: '1.0.0',
    scripts: {},
    dependencies: {},
    ...overrides,
  };
}
