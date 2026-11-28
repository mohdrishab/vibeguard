import type { Issue, IssueEvidence } from '@closed-door/core';
import { describe, expect, it } from 'vitest';

import { sortIssues } from './issues.js';

/**
 * `npm audit` reports advisory ids as numbers at runtime even though the
 * contract types `ruleId` as a string. Build the exact shape that caused the
 * published CLI to crash when scanning a project with vulnerable packages.
 */
function issueWithRuleId(ruleId: unknown, file: string, startLine: number): Issue {
  return {
    id: `vg-test-${file}-${startLine}`,
    category: 'security',
    severity: 'high',
    confidence: 'confirmed',
    title: 'Vulnerable dependency',
    description: 'test issue',
    location: { file, startLine, endLine: startLine },
    evidence: [{ ruleId } as IssueEvidence],
    recommendation: 'Upgrade the dependency',
    fixability: 'manual-only',
    status: 'open',
    source: 'dependency-audit',
  };
}

describe('sortIssues', () => {
  it('sorts deterministically when npm advisory ids are numeric', () => {
    const issues = [
      issueWithRuleId(1241260, 'package.json', 1),
      issueWithRuleId(1193683, 'package.json', 1),
    ];

    expect(() => sortIssues(issues)).not.toThrow();
    expect(sortIssues(issues).map((issue) => issue.evidence[0]?.ruleId)).toEqual([
      1193683, 1241260,
    ]);
  });

  it('sorts findings that carry no evidence at all', () => {
    const withoutEvidence = issueWithRuleId('ts-rule', 'src/index.ts', 1);
    const emptyEvidence: Issue = { ...withoutEvidence, evidence: [] };

    expect(() => sortIssues([emptyEvidence, withoutEvidence])).not.toThrow();
  });
});
