import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestProject, minimalPackageJson, packageJsonText } from '@closed-door/testing';
import { buildAuditCommand, DependencyAudit } from './dependency-audit.js';

const disposables: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(disposables.splice(0).map((dispose) => dispose()));
  vi.restoreAllMocks();
});

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => {
  return {
    execFile: execFileMock,
  };
});

type AuditAdvisory = Record<string, unknown>;

async function fixtureProject(files: Record<string, string>): Promise<string> {
  const project = await createTestProject({ ...files, 'package-lock.json': '{}' });
  disposables.push(project.dispose);
  return project.root;
}

function advisoryOverrides(advisories: Record<string, AuditAdvisory>): string {
  return JSON.stringify({ advisories } as Record<string, AuditAdvisory>);
}

describe('DependencyAudit', () => {
  it('reports a critical vulnerability from npm audit JSON', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson({ dependencies: { lodash: '^4.17.0' } })),
    });

    execFileMock.mockImplementation((file, args, options, callback) => {
      callback(
        null,
        advisoryOverrides({
          '1': {
            id: '1',
            severity: 'critical',
            package_name: 'lodash',
            title: 'lodash prototype pollution',
            vulnerable_versions: '<4.17.21',
            patched_in: '>=4.17.21',
            overview: 'lodash is vulnerable to prototype pollution',
            accesses: ['public'],
            find_in: ['dependencies'],
            npm_advisory: { url: 'https://github.com/advisories/GHSA-xxxx' },
          },
        }),
        '',
      );
    });

    const scanner = new DependencyAudit();
    const issues = await scanner.analyze({
      root,
      name: 'test',
      languages: ['javascript'],
      frameworks: [],
      packageManager: 'npm',
      dependencies: ['lodash'],
      scripts: {},
      files: ['package.json'],
      entryPoints: [],
      configFiles: [],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('security');
    expect(issues[0].severity).toBe('critical');
    expect(issues[0].title).toBe('lodash prototype pollution');
    expect(issues[0].location.file).toBe('package.json');
    expect(issues[0].source).toBe('dependency-audit');
    expect(issues[0].evidence[0]?.metadata?.package).toBe('lodash');
  });

  it('maps moderate npm audit severity to high', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson({ dependencies: { somepkg: '^1.0.0' } })),
    });

    execFileMock.mockImplementation((file, args, options, callback) => {
      callback(
        null,
        advisoryOverrides({
          '1': {
            id: '1',
            severity: 'moderate',
            package_name: 'somepkg',
            title: 'somepkg issue',
            vulnerable_versions: '<1.0.1',
            patched_in: '>=1.0.1',
            overview: 'some issue',
            accesses: ['public'],
            find_in: ['dependencies'],
          },
        }),
        '',
      );
    });

    const scanner = new DependencyAudit();
    const issues = await scanner.analyze({
      root,
      name: 'test',
      languages: ['javascript'],
      frameworks: [],
      packageManager: 'npm',
      dependencies: ['somepkg'],
      scripts: {},
      files: ['package.json'],
      entryPoints: [],
      configFiles: [],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('high');
  });

  it('returns no issues when audit finds no vulnerabilities', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson({ dependencies: { safepkg: '^1.0.0' } })),
    });

    execFileMock.mockImplementation((file, args, options, callback) => {
      callback(null, advisoryOverrides({}), '');
    });

    const scanner = new DependencyAudit();
    const issues = await scanner.analyze({
      root,
      name: 'test',
      languages: ['javascript'],
      frameworks: [],
      packageManager: 'npm',
      dependencies: ['safepkg'],
      scripts: {},
      files: ['package.json'],
      entryPoints: [],
      configFiles: [],
    });

    expect(issues).toHaveLength(0);
  });

  it('fails explicitly when the audit command fails without JSON output', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson({ dependencies: { somepkg: '^1.0.0' } })),
    });

    execFileMock.mockImplementation((file, args, options, callback) => {
      callback(Object.assign(new Error('command not found'), { code: 'ENOENT' }), '', '');
    });

    const scanner = new DependencyAudit();
    await expect(
      scanner.analyze({
        root,
        name: 'test',
        languages: ['javascript'],
        frameworks: [],
        packageManager: 'npm',
        dependencies: ['somepkg'],
        scripts: {},
        files: ['package.json'],
        entryPoints: [],
        configFiles: [],
      }),
    ).rejects.toThrow(/not found on PATH/u);
  });

  it('reports a timeout distinctly from a missing executable', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson({ dependencies: { somepkg: '^1.0.0' } })),
    });

    execFileMock.mockImplementation((file, args, options, callback) => {
      callback(Object.assign(new Error('killed'), { killed: true, signal: 'SIGTERM' }), '', '');
    });

    const scanner = new DependencyAudit();
    await expect(
      scanner.analyze({
        root,
        name: 'test',
        languages: ['javascript'],
        frameworks: [],
        packageManager: 'npm',
        dependencies: ['somepkg'],
        scripts: {},
        files: ['package.json'],
        entryPoints: [],
        configFiles: [],
      }),
    ).rejects.toThrow(/timed out after 15 seconds/u);
  });

  it('invokes cmd.exe with a fixed allowlisted command on Windows', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson({ dependencies: { lodash: '^4.17.0' } })),
    });

    execFileMock.mockImplementation((file, args, options, callback) => {
      callback(null, advisoryOverrides({}), '');
    });

    const scanner = new DependencyAudit('win32');
    await scanner.analyze({
      root,
      name: 'test',
      languages: ['javascript'],
      frameworks: [],
      packageManager: 'npm',
      dependencies: ['lodash'],
      scripts: {},
      files: ['package.json', 'package-lock.json'],
      entryPoints: [],
      configFiles: [],
    });

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const call = execFileMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(call[0]).toBe('cmd.exe');
    expect(call[1]).toEqual(['/d', '/s', '/c', 'npm.cmd audit --json']);
    expect(call[2]).toMatchObject({ cwd: root, windowsHide: true, timeout: 15_000 });
  });

  it('does not interpolate project-controlled values into the shell command', async () => {
    const maliciousRoot = 'C:\\project & calc.exe';
    execFileMock.mockImplementation((file, args, options, callback) => {
      callback(null, advisoryOverrides({}), '');
    });

    const scanner = new DependencyAudit('win32');
    await scanner.analyze({
      root: maliciousRoot,
      name: 'x && calc.exe',
      languages: ['javascript'],
      frameworks: [],
      packageManager: 'pnpm',
      dependencies: ['lodash & calc.exe'],
      scripts: { postinstall: 'calc.exe' },
      files: ['package.json', 'pnpm-lock.yaml'],
      entryPoints: [],
      configFiles: [],
    });

    const call = execFileMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(call[0]).toBe('cmd.exe');
    expect(call[1]).toEqual(['/d', '/s', '/c', 'pnpm.cmd audit --json']);
    expect(call[1].join(' ')).not.toContain('calc');
  });

  it('reads modern npm audit vulnerabilities output', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson({ dependencies: { lodash: '^4.17.0' } })),
    });

    execFileMock.mockImplementation((file, args, options, callback) => {
      callback(
        null,
        JSON.stringify({
          auditReportVersion: 2,
          vulnerabilities: {
            lodash: {
              name: 'lodash',
              severity: 'high',
              range: '<4.17.21',
              via: [
                {
                  source: 123,
                  name: 'lodash',
                  title: 'lodash prototype pollution',
                  url: 'https://example.com/advisory',
                  range: '<4.17.21',
                },
              ],
              fixAvailable: true,
            },
          },
        }),
        '',
      );
    });

    const scanner = new DependencyAudit();
    const issues = await scanner.analyze({
      root,
      name: 'test',
      languages: ['javascript'],
      frameworks: [],
      packageManager: 'npm',
      dependencies: ['lodash'],
      scripts: {},
      files: ['package.json'],
      entryPoints: [],
      configFiles: [],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.title).toBe('lodash prototype pollution');
    expect(issues[0]?.severity).toBe('high');
  });

  it('is not applicable for package managers without a supported audit command', async () => {
    const scanner = new DependencyAudit();
    expect(
      scanner.applicability({
        root: '/tmp/project',
        name: 'project',
        languages: ['javascript'],
        frameworks: [],
        packageManager: 'bun',
        dependencies: ['react'],
        scripts: {},
        files: ['package.json', 'bun.lock'],
        entryPoints: [],
        configFiles: [],
      }),
    ).toMatchObject({ kind: 'not-applicable' });
  });

  it('is not applicable when there are no dependencies', async () => {
    const root = await fixtureProject({
      'package.json': packageJsonText(minimalPackageJson()),
    });
    const scanner = new DependencyAudit();
    const applicability = scanner.applicability({
      root,
      name: 'test',
      languages: ['javascript'],
      frameworks: [],
      packageManager: 'npm',
      dependencies: [],
      scripts: {},
      files: ['package.json'],
      entryPoints: [],
      configFiles: [],
    });

    expect(applicability.kind).toBe('not-applicable');
  });
});

describe('buildAuditCommand', () => {
  it('launches npm directly on POSIX platforms', () => {
    expect(buildAuditCommand('npm', 'linux')).toEqual({ file: 'npm', args: ['audit', '--json'] });
  });

  it('launches pnpm directly on macOS', () => {
    expect(buildAuditCommand('pnpm', 'darwin')).toEqual({
      file: 'pnpm',
      args: ['audit', '--json'],
    });
  });

  it('routes npm through cmd.exe on Windows', () => {
    expect(buildAuditCommand('npm', 'win32')).toEqual({
      file: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd audit --json'],
    });
  });

  it('routes pnpm through cmd.exe on Windows', () => {
    expect(buildAuditCommand('pnpm', 'win32')).toEqual({
      file: 'cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm.cmd audit --json'],
    });
  });

  it('rejects unsupported package managers instead of building a shell string', () => {
    expect(() => buildAuditCommand('yarn; calc.exe' as never, 'win32')).toThrow(
      /No dependency audit command/u,
    );
    expect(() => buildAuditCommand('yarn; calc.exe' as never, 'linux')).toThrow(
      /No dependency audit command/u,
    );
  });
});
