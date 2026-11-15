import type { Fixability, IssueCategory } from '@closed-door/core';

/**
 * How risky an autonomous repair is. These gate the repair engine:
 *
 * - SAFE      deterministic transformations, applied automatically.
 * - MODERATE  behavior-affecting fixes, applied then verified against tests.
 * - DANGEROUS security-sensitive or destructive logic — requires explicit
 *             human approval before any patch is generated.
 */
export type SafetyLevel = 'safe' | 'moderate' | 'dangerous';

/**
 * Default safety classification for an issue category.
 *
 * - 'security' is always dangerous: security-sensitive logic (auth,
 *   authz, payment, database, destructive operations) must never be
 *   patched without human review.
 * - 'code-quality' is treated as safe (deterministic, low-risk edits).
 * - 'bug', 'performance', and 'architecture' are moderate:
 *   behavior-affecting, verified via tests, lint, and typecheck.
 *
 * Unknown categories fail loudly rather than defaulting to 'safe'.
 */
export function defaultSafetyLevelFor(category: IssueCategory): SafetyLevel {
  switch (category) {
    case 'security':
      return 'dangerous';
    case 'code-quality':
      return 'safe';
    case 'bug':
    case 'performance':
    case 'architecture':
      return 'moderate';
  }
  // Runtime defense for values that bypassed the static type (config
  // files, AI output in later phases). Falls through here, not 'safe'.
  throw new RangeError(`Unknown issue category: "${String(category)}"`);
}

/**
 * Maps a safety level to the conservative default fixability used when an
 * analyzer does not specify one.
 */
export function defaultFixabilityFor(level: SafetyLevel): Fixability {
  switch (level) {
    case 'safe':
      return 'auto-safe';
    case 'moderate':
      return 'ai-suggested';
    case 'dangerous':
      return 'manual-only';
  }
}
