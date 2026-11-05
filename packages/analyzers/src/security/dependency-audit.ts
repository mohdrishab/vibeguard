import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { Issue, ProjectInfo, Severity } from '@vibeguard/core';

import type { Analyzer } from '../analyzer.js';
import { buildIssue, makeEvidence } from '../issues.js';

const execFileAsync = promisify(execFile);

const DEP_AUDIT_ID = 'dependency-audit';
const DEP_AUDIT_NAME = 'Dependency Audit';

export interface AuditVulnerability {
  readonly id: string;
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

export interface AuditReport {
  readonly advisories?: Readonly<Record<string, AuditVulnerability>>;
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

export class DependencyAudit implements Analyzer {
  public readonly id = DEP_AUDIT_ID;
  public readonly name = DEP_AUDIT_NAME;

  public applicability(
    project: ProjectInfo,
  ): { kind: 'applicable' } | { kind: 'not-applicable'; reason: string } {
    if (!project.dependencies.some((dep) => dep !== '')) {
      return {
        kind: 'not-applicable',
        reason: 'No dependencies declared in package.json.',
      };
    }
    return { kind: 'applicable' };
  }

  public async analyze(project: ProjectInfo): Promise<readonly Issue[]> {
    const audit = await this.runAudit(project.root);
    const advisories = audit.advisories ?? {};
    const issues: Issue[] = [];

    for (const advisory of Object.values(advisories)) {
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
          fixability: 'auto-moderate',
          source: DEP_AUDIT_ID,
          evidence: makeEvidence(
            advisory.id,
            undefined,
            {
              package: advisory.package_name,
              vulnerableVersions: advisory.vulnerable_versions,
              patchedIn: advisory.patched_in,
              accesses: advisory.accesses,
            },
          ),
        }),
      );
    }

    return issues;
  }

  private async runAudit(root: string): Promise<AuditReport> {
    let manager: 'npm' | 'pnpm';
    try {
      await execFileAsync('pnpm', ['--version'], { cwd: root });
      manager = 'pnpm';
    } catch {
      manager = 'npm';
    }

    try {
      const result = await execFileAsync(
        manager,
        manager === 'pnpm' ? ['audit', '--json'] : ['audit', '--json'],
        { cwd: root, encoding: 'utf8' },
      ) as unknown as string | { stdout: string; stderr: string };
      const stdout = typeof result === 'string' ? result : result.stdout;
      return JSON.parse(stdout) as AuditReport;
    } catch (error: unknown) {
      // npm/pnpm audit exits non-zero when vulnerabilities are found, but
      // still emits JSON on stdout. Parse whatever we can; if it is not
      // JSON at all, report zero findings rather than failing the scan.
      const stdout = (error as { stdout?: string }).stdout;
      if (typeof stdout === 'string' && stdout.trim().length > 0) {
        try {
          return JSON.parse(stdout) as AuditReport;
        } catch {
          return { advisories: {} };
        }
      }
      return { advisories: {} };
    }
  }
}
