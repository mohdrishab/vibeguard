// Minimal unified issue deduplication for Phase 5
import type { Issue } from '@vibeguard/core';

/**
 * Groups issues by their code location (file + start line) so that
 * findings from different analyzers targeting the same line can be
 * consolidated.
 */
function groupByLocation(issues: readonly Issue[]): Map<string, Issue[]> {
  const groups = new Map<string, Issue[]>();
  for (const issue of issues) {
    const key = `${issue.location.file}\0${issue.location.startLine}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(issue);
  }
  return groups;
}

/**
 * Merges two Issue objects into one, keeping highest severity and
 * combining evidence.
 */
function mergeIssues(a: Issue, b: Issue): Issue {
  const severities: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const aSec: string = a.severity;
  const bSec: string = b.severity;
  const highest: string = severities[aSec] >= severities[bSec] ? aSec : bSec;

  const combinedEv: readonly Issue['evidence'][] =
    a.evidence.length > 0 || b.evidence.length > 0
      ? [
          ...a.evidence,
          ...b.evidence.filter(
            (_e, i) => i >= a.evidence.length || _e.snippet !== a.evidence[0]?.snippet,
          ),
        ]
      : [];

  const combinedTitle: string = a.title === b.title ? a.title : `${a.title} & similar issue`;

  return {
    ...a,
    severity: highest,
    title: combinedTitle,
    evidence: combinedEv,
    source: ` unified:${a.source},${b.source}`,
    id: `vg-${require('node:crypto')
      .createHash('sha256')
      .update(
        [a.source, b.source, a.location.file, String(a.location.startLine), a.title, b.title].join(
          '\u001f',
        ),
        'utf8',
      )
      .digest('hex')
      .slice(0, 16)}`,
  } as Issue;
}

/**
 * Deduplicates and consolidates issues from multiple analyzers.
 * - Groups by (file, startLine)
 * - Same title → merged with highest severity + combined evidence
 * - Different titles → "title & similar issue" consolidation
 */
export function deduplicateIssues(issues: readonly Issue[]): Issue[] {
  const grouped = groupByLocation(issues);
  const result: Issue[] = [];

  for (const [, group] of grouped) {
    if (group.length <= 1) {
      result.push(group[0]);
      continue;
    }
    let merged = group[0];
    for (let i = 1; i < group.length; i += 1) {
      merged = mergeIssues(merged, group[i]!);
    }
    result.push(merged);
  }

  return result.sort((a, b) => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const aScore = order[a.severity] ?? 99;
    const bScore = order[b.severity] ?? 99;
    if (aScore !== bScore) return aScore - bScore;
    return a.location.file.localeCompare(b.location.file);
  });
}
