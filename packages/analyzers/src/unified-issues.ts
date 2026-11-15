import { createHash } from 'node:crypto';

import type { Issue, IssueEvidence } from '@closed-door/core';
import { compareSeverity } from '@closed-door/core';

/**
 * Builds a deduplication key that only groups the same rule, title, and
 * precise source location. Different findings on the same line stay distinct.
 */
function issueKey(issue: Issue): string {
  return [
    issue.location.file,
    issue.location.startLine,
    issue.location.endLine,
    issue.location.startColumn ?? '',
    issue.location.endColumn ?? '',
    issue.evidence[0]?.ruleId ?? '',
    issue.title,
  ].join('\0');
}

function uniqueEvidence(evidence: readonly IssueEvidence[]): readonly IssueEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mergeIssues(issues: readonly Issue[]): Issue {
  const first = issues[0];
  if (first === undefined) {
    throw new Error('Cannot merge an empty issue group');
  }

  const severity = issues.reduce(
    (highest, issue) => (compareSeverity(issue.severity, highest) < 0 ? issue.severity : highest),
    first.severity,
  );
  const sources = [...new Set(issues.flatMap((issue) => issue.source.split(', ')))].sort();
  const evidence = uniqueEvidence(issues.flatMap((issue) => [...issue.evidence]));
  const key = issueKey(first);
  const id = `vg-${createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 16)}`;

  return {
    ...first,
    id,
    severity,
    confidence: issues.some((issue) => issue.confidence === 'suspected')
      ? 'suspected'
      : 'confirmed',
    evidence,
    source: sources.join(', '),
  };
}

/**
 * Deduplicates exact overlapping rule findings. Findings are only considered
 * duplicates when their rule, title, and precise location all match.
 */
export function deduplicateIssues(issues: readonly Issue[]): Issue[] {
  const grouped = new Map<string, Issue[]>();
  for (const issue of issues) {
    const key = issueKey(issue);
    const group = grouped.get(key);
    if (group === undefined) {
      grouped.set(key, [issue]);
    } else {
      group.push(issue);
    }
  }

  return [...grouped.values()]
    .map((group) => (group.length === 1 ? (group[0] as Issue) : mergeIssues(group)))
    .sort(
      (a, b) =>
        compareSeverity(a.severity, b.severity) ||
        a.location.file.localeCompare(b.location.file) ||
        a.location.startLine - b.location.startLine ||
        (a.location.startColumn ?? 0) - (b.location.startColumn ?? 0) ||
        a.title.localeCompare(b.title),
    );
}
