import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createTestProject } from '@closed-door/testing';
import { CONFIG_FILE_NAME, loadConfig, serializeConfig, writeConfig } from './load.js';
import { defaultConfig, vibeguardConfigSchema } from './schema.js';

const disposables: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposables.splice(0).map((dispose) => dispose()));
});

async function fixtureProject(files: Record<string, string>): Promise<string> {
  const project = await createTestProject(files);
  disposables.push(project.dispose);
  return project.root;
}

describe('vibeguardConfigSchema', () => {
  it('accepts the canonical shape', () => {
    const parsed = vibeguardConfigSchema.parse({
      version: 1,
      scan: { exclude: ['src/generated/**'] },
    });
    expect(parsed).toEqual({
      version: 1,
      scan: { exclude: ['src/generated/**'] },
    });
  });

  it('applies defaults for a minimal config', () => {
    expect(vibeguardConfigSchema.parse({ version: 1 })).toEqual(defaultConfig());
  });

  it('rejects unknown keys (strict object)', () => {
    expect(() => vibeguardConfigSchema.parse({ version: 1, unknownKey: true })).toThrow();
  });

  it('rejects version values other than 1', () => {
    expect(() => vibeguardConfigSchema.parse({ version: 2 })).toThrow();
    expect(() => vibeguardConfigSchema.parse({})).toThrow();
  });

  it('rejects malformed exclude entries', () => {
    expect(() => vibeguardConfigSchema.parse({ version: 1, scan: { exclude: [42] } })).toThrow();
    expect(() => vibeguardConfigSchema.parse({ version: 1, scan: { exclude: [''] } })).toThrow();
  });
});

describe('defaultConfig', () => {
  it('is the documented default', () => {
    expect(defaultConfig()).toEqual({ version: 1, scan: { exclude: [] } });
  });
});

describe('loadConfig', () => {
  it('returns null when no config file exists', async () => {
    const root = await fixtureProject({ 'package.json': '{}' });
    expect(await loadConfig(root)).toBeNull();
  });

  it('loads and validates a real config', async () => {
    const root = await fixtureProject({
      'package.json': '{}',
      [CONFIG_FILE_NAME]: JSON.stringify({
        $schema: 'non-published-reference omitted intentionally',
        version: 1,
        scan: { exclude: ['dist/**'] },
      }),
    });

    // Sanity: $schema alone is valid input even though init never writes it.
    const resolved = await loadConfig(root);
    expect(resolved).not.toBeNull();
    expect(resolved?.config).toEqual({
      $schema: 'non-published-reference omitted intentionally',
      version: 1,
      scan: { exclude: ['dist/**'] },
    });
    expect(resolved?.path.endsWith(CONFIG_FILE_NAME)).toBe(true);
  });

  it('throws INVALID_CONFIG for malformed JSON', async () => {
    const root = await fixtureProject({ [CONFIG_FILE_NAME]: '{ nope' });
    await expect(loadConfig(root)).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    });
  });

  it('throws INVALID_CONFIG for schema violations with details', async () => {
    const root = await fixtureProject({
      [CONFIG_FILE_NAME]: JSON.stringify({ version: 1, bogus: 1 }),
    });
    await expect(loadConfig(root)).rejects.toThrow(/Unrecognized key/u);
  });

  it('maps unreadable config paths to INVALID_CONFIG', async () => {
    // Sanity: a root without config loads as null.
    const root = await fixtureProject({ 'package.json': '{}' });
    expect(await loadConfig(root)).toBeNull();

    // A directory at the config path: readFile fails with EISDIR, which
    // (unlike ENOENT) must surface as INVALID_CONFIG, not "no config".
    const weirdRoot = await fixtureProject({});
    await mkdir(path.join(weirdRoot, CONFIG_FILE_NAME), { recursive: true });
    await expect(loadConfig(weirdRoot)).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    });
  });
});

describe('writeConfig', () => {
  it('writes and serializes the config', async () => {
    const root = await fixtureProject({ 'package.json': '{}' });
    const target = await writeConfig({ root, config: defaultConfig() });

    expect(target.endsWith(CONFIG_FILE_NAME)).toBe(true);
    expect(serializeConfig(defaultConfig())).toBe(`${JSON.stringify(defaultConfig(), null, 2)}\n`);
    const text = await loadConfig(root);
    expect(text?.config).toEqual(defaultConfig());
  });

  it('refuses to overwrite an existing config without force', async () => {
    const root = await fixtureProject({
      'package.json': '{}',
      [CONFIG_FILE_NAME]: JSON.stringify({ version: 1, scan: { exclude: ['user/**'] } }),
    });

    // The original user config text must survive any failed write.
    await expect(
      writeConfig({ root, config: defaultConfig(), force: false }),
    ).rejects.toMatchObject({ code: 'CONFIG_EXISTS' });

    const after = await loadConfig(root);
    expect(after?.config.scan.exclude).toEqual(['user/**']);
  });

  it('overwrites only with force', async () => {
    const root = await fixtureProject({
      [CONFIG_FILE_NAME]: JSON.stringify({ version: 1, scan: { exclude: ['old/**'] } }),
    });

    await writeConfig({ root, config: defaultConfig(), force: true });

    const after = await loadConfig(root);
    expect(after?.config).toEqual(defaultConfig());
  });

  it('fails with NO_PROJECT when the root directory is missing', async () => {
    // force=false relies on exclusive-create 'wx', which surfaces ENOENT.
    await expect(
      writeConfig({
        root: `${process.cwd()}\\definitely\\missing\\path\\here`,
        config: defaultConfig(),
      }),
    ).rejects.toMatchObject({ code: 'NO_PROJECT' });
  });

  it('keeps serializeConfig stable across calls', () => {
    expect(serializeConfig(defaultConfig())).toBe(serializeConfig(defaultConfig()));
  });
});
