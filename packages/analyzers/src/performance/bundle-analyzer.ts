import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Issue, ProjectInfo } from '@vibeguard/core';

import type { Analyzer } from '../analyzer.js';
import { buildIssue, lintableFiles, makeEvidence } from '../issues.js';

const BUNDLE_ID = 'bundle-analyzer';
const BUNDLE_NAME = 'Bundle Analyzer';

/**
 * Dependencies commonly associated with large bundle impact. These are
 * flagged as suspected (not confirmed) because bundle size depends on
 * tree-shaking, usage patterns, and whether the dependency is actually
 * imported in application code.
 */
const HEAVY_DEPS: Readonly<Record<string, { sizeHint: string; recommendation: string }>> =
  Object.freeze({
    lodash: {
      sizeHint: '~70 KB minified',
      recommendation:
        'Prefer importing individual methods (e.g. lodash/omit) or native equivalents to avoid bundling the whole library.',
    },
    moment: {
      sizeHint: '~66 KB minified + locale data',
      recommendation:
        'Replace with date-fns, dayjs, or native Intl/Date APIs; moment is in maintenance mode and bundles all locales by default.',
    },
    jquery: {
      sizeHint: '~30 KB minified',
      recommendation:
        'Remove jQuery if the project does not require DOM manipulation or legacy browser support.',
    },
    axios: {
      sizeHint: '~14 KB minified',
      recommendation:
        'Consider native fetch or a smaller HTTP client unless interceptors/progress tracking are required.',
    },
    rxjs: {
      sizeHint: '~40 KB minified (tree-shakeable)',
      recommendation:
        'Ensure rxjs operators are imported patch-side (rxjs/operators) and unused operators are tree-shaken.',
    },
  });

export class BundleAnalyzer implements Analyzer {
  public readonly id = BUNDLE_ID;
  public readonly name = BUNDLE_NAME;

  public applicability(
    project: ProjectInfo,
  ): { kind: 'applicable' } | { kind: 'not-applicable'; reason: string } {
    if (project.dependencies.length === 0) {
      return {
        kind: 'not-applicable',
        reason: 'No dependencies declared in package.json.',
      };
    }
    return { kind: 'applicable' };
  }

  public async analyze(project: ProjectInfo): Promise<readonly Issue[]> {
    const issues: Issue[] = [];

    // Flag heavy dependencies declared in the manifest (suspected, not confirmed).
    for (const dep of project.dependencies) {
      const heavy = HEAVY_DEPS[dep];
      if (heavy !== undefined) {
        issues.push(
          buildIssue({
            category: 'performance',
            severity: 'medium',
            title: `Heavy dependency: ${dep}`,
            description:
              `${dep} adds approximately ${heavy.sizeHint} to the bundle. ` +
              'This is a suspected, not confirmed, bundle-size issue — actual impact depends on tree-shaking and usage.',
            file: 'package.json',
            startLine: 1,
            endLine: 1,
            recommendation: heavy.recommendation,
            fixability: 'auto-moderate',
            source: BUNDLE_ID,
            evidence: makeEvidence(
              dep,
              undefined,
              { kind: 'heavy-dependency', sizeHint: heavy.sizeHint },
            ),
          }),
        );
      }
    }

    // Flag large asset files referenced in source (suspected).
    const files = lintableFiles(project.files);
    for (const file of files) {
      const assetIssues = await this.scanForLargeAssets(project, file);
      issues.push(...assetIssues);
    }

    return issues;
  }

  private async scanForLargeAssets(
    project: ProjectInfo,
    file: string,
  ): Promise<Issue[]> {
    let content: string;
    try {
      content = await readFile(path.join(project.root, ...file.split('/')), 'utf8');
    } catch {
      return [];
    }

    const issues: Issue[] = [];
    const lines = content.split(/\r?\n/u);

    // Large image/video/asset imports that may bloat the bundle.
    const assetRegex = /from\s+['"]([^'"]*\.(?:png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot|mp4|webm|mov|avi|pdf|zip|tar|gz))['"]/g;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (line === undefined) {
        continue;
      }
      const startLine = lineIndex + 1;

      let match: RegExpExecArray | null;
      assetRegex.lastIndex = 0;
      while ((match = assetRegex.exec(line)) !== null) {
        const assetPath = match[1];
        issues.push(
          buildIssue({
            category: 'performance',
            severity: 'low',
            title: `Large asset import: ${assetPath}`,
            description:
              `The file imports a potentially large binary asset (${assetPath}). ` +
              'Unoptimized assets can significantly increase bundle size and slow page loads.',
            file,
            startLine,
            endLine: startLine,
            recommendation:
              'Optimize the asset (compress images, subset fonts, lazy-load videos), or load it dynamically to avoid blocking the initial bundle.',
            fixability: 'manual-only',
            source: BUNDLE_ID,
            evidence: makeEvidence(
              'large-asset-import',
              line.trim(),
              { assetPath },
            ),
          }),
        );
      }
    }

    return issues;
  }
}
