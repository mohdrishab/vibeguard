import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { Issue, ProjectInfo, Severity } from '@closed-door/core';

import type { Analyzer } from '../analyzer.js';
import { buildIssue, makeEvidence } from '../issues.js';

const execFileAsync = promisify(execFile);

const DEP_AUDIT_ID = 'dependency-audit';
const DEP_AUDIT_NAME = 'Dependency Audit';
const AUDIT_TIMEOUT_MS = 15_000;

type AuditablePackageManager = 'npm' | 'pnpm';

export interface AuditCommand {
  /** Executable to launch. */
  readonly file: string;
  /** Fixed argument list; never contains user-supplied text. */
  readonly args: readonly string[];
}

const POSIX_AUDIT_COMMANDS: Readonly<Record<AuditablePackageManager, AuditCommand>> = Object.freeze(
  {
    npm: Object.freeze({ file: 'npm', args: Object.freeze(['audit', '--json']) }),
    pnpm: Object.freeze({ file: 'pnpm', args: Object.freeze(['audit', '--json']) }),
  },
);

/**
 * Builds the audit invocation for the current platform.
 *
 * On Windows, npm and pnpm are `.cmd` shims that `execFile` cannot launch
 * directly, so the command is routed through `cmd.exe` with `/d /s /c`.
 * The shell string is fixed and allowlisted per package manager — no
 * project-controlled value is ever interpolated into it.
 */
export function buildAuditCommand(
  packageManager: AuditablePackageManager,
  platform: NodeJS.Platform = process.platform,
): AuditCommand {
  const posix = POSIX_AUDIT_COMMANDS[packageManager];
  if (posix === undefined) {
    throw new Error(`No dependency audit command is defined for ${String(packageManager)}.`);
  }
  if (platform !== 'win32') {
    return posix;
  }
  return Object.freeze({
    file: 'cmd.exe',
    args: Object.freeze(['/d', '/s', '/c', `${packageManager}.cmd audit --json`]),
  });
}

function describeAuditFailure(error: unknown, packageManager: AuditablePackageManager): string {
  const record = isRecord(error) ? error : {};
  if (record['code'] === 'ENOENT') {
    return `the ${packageManager} executable was not found on PATH`;
  }
  if (record['code'] === 'ETIMEDOUT' || record['killed'] === true) {
    return `the command timed out after ${AUDIT_TIMEOUT_MS / 1000} seconds`;
  }
  return error instanceof Error ? error.message : String(error);
}

export interface AuditVulnerability {
  /** npm audit emits numeric advisory ids; older reports used strings. */
  readonly id: number | string;
  readonly severity: 'critical' | 'high' | 'moderate' | 'low' | 'info';
  readonly package_name: string;
  readonly title: string;
  readonly vulnerable_versions: string;
  readonly patched_in: string;
  readonly overview: string;
  readonly accesses: readonly string[];
  readonly find_in: readonly string[];
  readonly npm_advisory?: { readonly url: string };
}

interface NpmAdvisory {
  readonly source?: number;
  readonly title?: string;
  readonly url?: string;
  readonly range?: string;
}

interface NpmVulnerability {
  readonly name: string;
  readonly severity: string;
  readonly range: string;
  readonly via: readonly (string | NpmAdvisory)[];
  readonly fixAvailable?: boolean | { readonly name: string; readonly version: string };
}

export interface AuditReport {
  readonly advisories?: Readonly<Record<string, AuditVulnerability>>;
  readonly vulnerabilities?: Readonly<Record<string, NpmVulnerability>>;
}

function npmAuditSeverity(severity: string): Severity {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'moderate':
      return 'high';
    case 'low':
      return 'medium';
    default:
      return 'low';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAuditReport(stdout: string): AuditReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Dependency audit returned invalid JSON: ${reason}`, { cause: error });
  }

  if (
    !isRecord(parsed) ||
    (parsed['advisories'] !== undefined && !isRecord(parsed['advisories'])) ||
    (parsed['vulnerabilities'] !== undefined && !isRecord(parsed['vulnerabilities']))
  ) {
    throw new Error('Dependency audit returned an unexpected JSON report.');
  }
  return parsed as AuditReport;
}

export class DependencyAudit implements Analyzer {
  public readonly id = DEP_AUDIT_ID;
  public readonly name = DEP_AUDIT_NAME;

  readonly #platform: NodeJS.Platform;

  /** @param platform Injectable for deterministic Windows-path tests. */
  constructor(platform: NodeJS.Platform = process.platform) {
    this.#platform = platform;
  }

  public applicability(
    project: ProjectInfo,
  ): { kind: 'applicable' } | { kind: 'not-applicable'; reason: string } {
    if (project.packageManager !== 'npm' && project.packageManager !== 'pnpm') {
      return {
        kind: 'not-applicable',
        reason: `Dependency auditing is not supported for ${project.packageManager} projects yet.`,
      };
    }
    const lockfile = project.packageManager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml';
    if (!project.files.includes(lockfile)) {
      return {
        kind: 'not-applicable',
        reason: `No ${lockfile} lockfile; dependency audit was not run.`,
      };
    }
    if (project.dependencies.length === 0) {
      return {
        kind: 'not-applicable',
        reason: 'No dependencies declared in package.json.',
      };
    }
    return { kind: 'applicable' };
  }

  public async analyze(project: ProjectInfo): Promise<readonly Issue[]> {
    const audit = await this.runAudit(project);
    const issues: Issue[] = [];

    for (const advisory of Object.values(audit.advisories ?? {})) {
      issues.push(
        buildIssue({
          category: 'security',
          severity: npmAuditSeverity(advisory.severity),
          title: advisory.title,
          description:
            `${advisory.overview}\n\n` +
            `Vulnerable versions: ${advisory.vulnerable_versions}. ` +
            `Patched in: ${advisory.patched_in ?? 'not yet patched'}.` +
            (advisory.npm_advisory?.url ? `\nAdvisory: ${advisory.npm_advisory.url}` : ''),
          file: 'package.json',
          startLine: 1,
          endLine: 1,
          recommendation:
            `Upgrade \`${advisory.package_name}\` to a non-vulnerable version (${advisory.patched_in ?? 'latest'}), ` +
            'or remove the dependency if it is no longer needed.',
          fixability: 'manual-only',
          source: DEP_AUDIT_ID,
          evidence: makeEvidence(String(advisory.id), undefined, {
            package: advisory.package_name,
            vulnerableVersions: advisory.vulnerable_versions,
            patchedIn: advisory.patched_in,
            accesses: advisory.accesses,
          }),
        }),
      );
    }

    for (const vulnerability of Object.values(audit.vulnerabilities ?? {})) {
      const advisory = vulnerability.via.find(
        (item): item is NpmAdvisory => typeof item !== 'string',
      );
      const patchedIn =
        typeof vulnerability.fixAvailable === 'object'
          ? `${vulnerability.fixAvailable.name}@${vulnerability.fixAvailable.version}`
          : vulnerability.fixAvailable === true
            ? 'a compatible patched version (see npm audit fix)'
            : 'not yet patched';
      issues.push(
        buildIssue({
          category: 'security',
          severity: npmAuditSeverity(vulnerability.severity),
          title: advisory?.title ?? `Vulnerable dependency: ${vulnerability.name}`,
          description:
            `${vulnerability.name} has a known vulnerability affecting ${vulnerability.range}.` +
            (advisory?.url ? `\nAdvisory: ${advisory.url}` : ''),
          file: 'package.json',
          startLine: 1,
          endLine: 1,
          recommendation: `Upgrade \`${vulnerability.name}\` to ${patchedIn}.`,
          fixability: 'manual-only',
          source: DEP_AUDIT_ID,
          evidence: makeEvidence(
            advisory?.source === undefined ? vulnerability.name : String(advisory.source),
            undefined,
            {
              package: vulnerability.name,
              vulnerableVersions: vulnerability.range,
              patchedIn,
              advisoryUrl: advisory?.url,
            },
          ),
        }),
      );
    }

    return issues;
  }

  private async runAudit(project: ProjectInfo): Promise<AuditReport> {
    const { root, packageManager } = project;
    if (packageManager !== 'npm' && packageManager !== 'pnpm') {
      throw new Error(
        `Dependency audit is not supported for ${packageManager} projects yet; use npm or pnpm.`,
      );
    }

    let stdout: string;
    try {
      const command = buildAuditCommand(packageManager, this.#platform);
      const result = await execFileAsync(command.file, [...command.args], {
        cwd: root,
        encoding: 'utf8',
        timeout: AUDIT_TIMEOUT_MS,
        // Keep audit execution invisible when the CLI runs on Windows.
        windowsHide: true,
      });
      stdout = typeof result === 'string' ? result : result.stdout;
    } catch (error: unknown) {
      // npm/pnpm exit non-zero when vulnerabilities are found, but still
      // provide a usable JSON report on stdout.
      const output = (error as { stdout?: unknown }).stdout;
      if (typeof output !== 'string' || output.trim() === '') {
        throw new Error(
          `Dependency audit command failed (${packageManager} audit): ` +
            describeAuditFailure(error, packageManager),
          { cause: error },
        );
      }
      stdout = output;
    }

    return parseAuditReport(stdout);
  }
}
