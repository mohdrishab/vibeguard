/**
 * Severity levels for detected issues, ordered from most to least urgent.
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Lower number ranks higher in prioritization output.
 * critical = 0 ... low = 3. Use {@link compareSeverity} rather than reading
 * this map directly so invalid values fail loudly.
 */
export const SEVERITY_RANK: Readonly<Record<Severity, number>> = Object.freeze({
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
});

/**
 * Orders two severities for prioritization: most severe first.
 *
 * @returns negative if `a` outranks `b`, positive if `b` outranks `a`,
 *          zero when equal.
 * @throws {RangeError} If either value is not a valid {@link Severity}.
 */
export function compareSeverity(a: Severity, b: Severity): number {
  const rankA = SEVERITY_RANK[a];
  const rankB = SEVERITY_RANK[b];
  if (rankA === undefined || rankB === undefined) {
    throw new RangeError(`Invalid severity value: "${a}", "${b}"`);
  }
  return rankA - rankB;
}
