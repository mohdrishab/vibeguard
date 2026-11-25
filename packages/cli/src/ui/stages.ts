/** Real scanner operations in display order. */
export type ScanStageId =
  'init' | 'discovery' | 'analysis' | 'security' | 'quality' | 'recommendations' | 'finalizing';

export interface StageDefinition {
  readonly id: ScanStageId;
  readonly label: string;
  readonly detail: string;
}

export const SCAN_STAGES: readonly StageDefinition[] = Object.freeze([
  { id: 'init', label: 'Initializing scanner', detail: 'Resolve configuration' },
  { id: 'discovery', label: 'Discovering project files', detail: 'Build the file index' },
  { id: 'analysis', label: 'Analysing source code', detail: 'ESLint + TypeScript' },
  { id: 'security', label: 'Running security checks', detail: 'Secrets + dependencies' },
  { id: 'quality', label: 'Detecting code quality issues', detail: 'React + bundle + Node' },
  { id: 'recommendations', label: 'Generating recommendations', detail: 'Dedupe and prioritize' },
  { id: 'finalizing', label: 'Finalizing report', detail: 'Assemble diagnostic summary' },
]);

const ENGINE_STAGES: Readonly<Record<string, ScanStageId>> = Object.freeze({
  eslint: 'analysis',
  tsc: 'analysis',
  'secret-scanner': 'security',
  'dependency-audit': 'security',
  'bundle-analyzer': 'quality',
  'react-performance': 'quality',
  'blocking-operations': 'quality',
});

export function stageForEngine(id: string): ScanStageId {
  return ENGINE_STAGES[id] ?? 'analysis';
}

const INIT_PROGRESS = 5;
const DISCOVERY_SPAN = 15;
const ANALYZER_SPAN = 68;
const RECOMMENDATION_SPAN = 6;

/**
 * Progress is claimed only when the corresponding operation completes —
 * never by a timer. These brackets make the live percentage truthful.
 */
export function discoveryProgress(indexed: number, total: number): number {
  if (total <= 0) {
    return INIT_PROGRESS + DISCOVERY_SPAN;
  }
  return INIT_PROGRESS + Math.round(DISCOVERY_SPAN * (Math.min(indexed, total) / total));
}

export function analyzerProgress(done: number, total: number): number {
  const base = INIT_PROGRESS + DISCOVERY_SPAN;
  if (total <= 0) {
    return base + ANALYZER_SPAN;
  }
  return base + Math.round(ANALYZER_SPAN * (Math.min(done, total) / total));
}

export function recommendationsProgress(): number {
  return INIT_PROGRESS + DISCOVERY_SPAN + ANALYZER_SPAN + RECOMMENDATION_SPAN;
}

export function finalizingProgress(): number {
  return recommendationsProgress() + 6;
}
