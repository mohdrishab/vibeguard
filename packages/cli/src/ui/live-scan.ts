import {
  analyzeProjectDetailed,
  defaultConfig,
  loadConfig,
  VibeGuardError,
  type Issue,
  type Severity,
} from '@closed-door/core';
import {
  createDefaultRegistry,
  deduplicateIssues,
  FileCache,
  sortIssues,
  type Analyzer,
  type AnalyzerContext,
  type AnalyzerRegistry,
} from '@closed-door/analyzers';

import {
  type ScanStageId,
  analyzerProgress,
  discoveryProgress,
  finalizingProgress,
  recommendationsProgress,
  stageForEngine,
} from './stages.js';

export type ScanStatus = 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
export type LogLevel = 'INFO' | 'SCAN' | 'WARN' | 'PASS' | 'DONE' | 'ERROR';
export type EngineStatus = 'passed' | 'failed' | 'skipped' | 'cancelled';

export interface ScanError {
  readonly code: string;
  readonly message: string;
}

export interface LiveLog {
  readonly id: number;
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
}

export interface EngineSummary {
  readonly id: string;
  readonly name: string;
  readonly status: EngineStatus;
  readonly stage: ScanStageId;
  readonly issues: number;
  readonly inapplicableReason?: string;
  readonly error?: string;
}

export interface LiveReport {
  readonly command: string;
  readonly root: string;
  readonly projectName: string;
  readonly status: 'completed' | 'failed' | 'cancelled';
  /** False when an applicable engine failed or the scan was cancelled. */
  readonly ok: boolean;
  readonly jsonOutput: boolean;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly filesAnalyzed: number;
  readonly excludedSensitiveFiles: readonly string[];
  readonly userExcludes: readonly string[];
  readonly findings: readonly Issue[];
  readonly bySeverity: Readonly<Record<Severity, number>>;
  readonly engines: readonly EngineSummary[];
  readonly error?: ScanError;
}

export type ScanEventPayload =
  | { readonly type: 'status'; readonly status: ScanStatus; readonly progress: number }
  | {
      readonly type: 'plan';
      readonly analyzers: readonly {
        readonly id: string;
        readonly name: string;
        readonly stage: ScanStageId;
      }[];
      readonly progress: number;
    }
  | { readonly type: 'stage'; readonly stage: ScanStageId; readonly progress: number }
  | { readonly type: 'log'; readonly log: LiveLog; readonly progress: number }
  | {
      readonly type: 'file';
      readonly file: string;
      readonly index: number;
      readonly total: number;
      readonly progress: number;
    }
  | { readonly type: 'analyzer'; readonly engine: EngineSummary; readonly progress: number }
  | {
      readonly type: 'issue';
      readonly issue: Issue;
      readonly count: number;
      readonly progress: number;
    }
  | { readonly type: 'result'; readonly report: LiveReport }
  | { readonly type: 'error'; readonly error: ScanError; readonly progress: number };

export interface LiveScanOptions {
  readonly command: string;
  readonly root: string;
  readonly jsonOutput: boolean;
  /** Injectable for deterministic tests; production uses the bundled registry. */
  readonly registry?: AnalyzerRegistry;
  readonly signal?: AbortSignal;
  readonly emit: (event: ScanEventPayload) => void;
}

export function countBySeverity(issues: readonly Issue[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const issue of issues) {
    if (issue.severity in counts) {
      counts[issue.severity] += 1;
    }
  }
  return counts;
}

function describeError(error: unknown): ScanError {
  if (error instanceof VibeGuardError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: 'SCAN_FAILED',
    message: error instanceof Error ? error.message : String(error),
  };
}

function safeMessage(error: unknown): string {
  const message = describeError(error).message;
  return message.length > 300 ? `${message.slice(0, 297)}…` : message;
}

interface EngineResult {
  readonly analyzer: Analyzer;
  readonly summary: EngineSummary;
  readonly issues: readonly Issue[];
}

/**
 * Streams a real scan. Stages, files, engines and findings are emitted only
 * when the corresponding operation completes. All bundled analyzers still run
 * in parallel, exactly as in the non-interactive `scan` command.
 */
export async function runLiveScan(options: LiveScanOptions): Promise<LiveReport> {
  const { command, root, jsonOutput, signal, emit } = options;
  const startedAt = new Date();
  let logId = 0;
  const emitLog = (level: LogLevel, message: string, progress: number): void => {
    logId += 1;
    emit({
      type: 'log',
      log: { id: logId, timestamp: new Date().toISOString(), level, message },
      progress,
    });
  };

  try {
    emit({ type: 'status', status: 'running', progress: 0 });
    emit({ type: 'stage', stage: 'init', progress: 0 });
    emitLog('INFO', 'Initializing VibeGuard scanner...', 0);

    const resolvedConfig = await loadConfig(root);
    const userExcludes = resolvedConfig?.config.scan.exclude ?? defaultConfig().scan.exclude;
    emitLog(
      'INFO',
      resolvedConfig === null
        ? 'No .vibeguardrc.json found — using default configuration'
        : `Loaded .vibeguardrc.json (${userExcludes.length} exclude pattern${userExcludes.length === 1 ? '' : 's'})`,
      2,
    );

    emit({ type: 'stage', stage: 'discovery', progress: 5 });
    const { project, excludedSensitiveFiles } = await analyzeProjectDetailed(root, {
      exclude: userExcludes,
    });
    const files = project.files;
    for (const [index, file] of files.entries()) {
      emit({
        type: 'file',
        file,
        index: index + 1,
        total: files.length,
        progress: discoveryProgress(index + 1, files.length),
      });
    }
    emitLog(
      'INFO',
      `Indexed ${files.length} file${files.length === 1 ? '' : 's'}; ${excludedSensitiveFiles.length} sensitive file${excludedSensitiveFiles.length === 1 ? '' : 's'} skipped without reading`,
      discoveryProgress(files.length, files.length),
    );

    const registry = options.registry ?? createDefaultRegistry();
    const analyzers = registry.list();
    const context: AnalyzerContext = { files: new FileCache() };
    const activeStages = new Set<ScanStageId>();
    const emittedIssues = new Map<string, string>();
    const engineResults: EngineResult[] = [];
    let completedEngines = 0;
    let currentFindings: readonly Issue[] = [];

    const emitIssued = (progress: number): void => {
      currentFindings = deduplicateIssues(
        sortIssues(engineResults.flatMap(({ issues }) => [...issues])),
      );
      for (const issue of currentFindings) {
        const signature = JSON.stringify(issue);
        if (emittedIssues.get(issue.id) !== signature) {
          emittedIssues.set(issue.id, signature);
          emit({ type: 'issue', issue, count: currentFindings.length, progress });
        }
      }
    };

    const finishEngine = (
      analyzer: Analyzer,
      summary: EngineSummary,
      issues: readonly Issue[],
    ): void => {
      engineResults.push({ analyzer, summary, issues });
      completedEngines += 1;
      const progress = analyzerProgress(completedEngines, analyzers.length);
      emit({ type: 'analyzer', engine: summary, progress });
      emitLog(
        summary.status === 'failed'
          ? 'ERROR'
          : summary.status === 'cancelled'
            ? 'WARN'
            : summary.status === 'skipped'
              ? 'INFO'
              : issues.length > 0
                ? 'WARN'
                : 'PASS',
        summary.status === 'failed'
          ? `${analyzer.name} failed — ${summary.error ?? 'unknown error'}`
          : summary.status === 'cancelled'
            ? `${analyzer.name} cancelled before execution`
            : summary.status === 'skipped'
              ? `${analyzer.name} skipped — ${summary.inapplicableReason ?? 'not applicable'}`
              : `${analyzer.name} completed — ${issues.length} finding${issues.length === 1 ? '' : 's'}`,
        progress,
      );
      emitIssued(progress);
    };

    emit({
      type: 'plan',
      analyzers: analyzers.map((analyzer) => ({
        id: analyzer.id,
        name: analyzer.name,
        stage: stageForEngine(analyzer.id),
      })),
      progress: analyzerProgress(0, analyzers.length),
    });
    emit({ type: 'stage', stage: 'analysis', progress: analyzerProgress(0, analyzers.length) });
    emitLog(
      'INFO',
      `Running ${analyzers.length} analysis engines in parallel`,
      analyzerProgress(0, analyzers.length),
    );

    const tasks = analyzers.map(async (analyzer): Promise<void> => {
      const stage = stageForEngine(analyzer.id);
      const applicability = analyzer.applicability?.(project) ?? { kind: 'applicable' as const };

      if (applicability.kind === 'not-applicable') {
        finishEngine(
          analyzer,
          {
            id: analyzer.id,
            name: analyzer.name,
            status: 'skipped',
            stage,
            issues: 0,
            inapplicableReason: applicability.reason,
          },
          [],
        );
        return;
      }
      if (signal?.aborted === true) {
        finishEngine(
          analyzer,
          { id: analyzer.id, name: analyzer.name, status: 'cancelled', stage, issues: 0 },
          [],
        );
        return;
      }

      if (!activeStages.has(stage)) {
        activeStages.add(stage);
        emit({
          type: 'stage',
          stage,
          progress: analyzerProgress(completedEngines, analyzers.length),
        });
      }
      emitLog(
        'SCAN',
        `Running ${analyzer.name} — ${stage} checks`,
        analyzerProgress(completedEngines, analyzers.length),
      );

      try {
        const issues = await analyzer.analyze(project, context);
        finishEngine(
          analyzer,
          { id: analyzer.id, name: analyzer.name, status: 'passed', stage, issues: issues.length },
          issues,
        );
      } catch (error: unknown) {
        finishEngine(
          analyzer,
          {
            id: analyzer.id,
            name: analyzer.name,
            status: 'failed',
            stage,
            issues: 0,
            error: safeMessage(error),
          },
          [],
        );
      }
    });

    await Promise.all(tasks);

    const engines = analyzers.map((analyzer) => {
      const result = engineResults.find((entry) => entry.analyzer === analyzer);
      return (
        result?.summary ?? {
          id: analyzer.id,
          name: analyzer.name,
          status: 'cancelled' as const,
          stage: stageForEngine(analyzer.id),
          issues: 0,
        }
      );
    });

    const cancelled = signal?.aborted === true;
    if (cancelled) {
      emitLog(
        'WARN',
        'Scan cancelled by user — partial results retained',
        analyzerProgress(completedEngines, analyzers.length),
      );
    }

    emit({ type: 'stage', stage: 'recommendations', progress: recommendationsProgress() });
    emitLog(
      'INFO',
      `Consolidated ${currentFindings.length} finding${currentFindings.length === 1 ? '' : 's'} from completed engines`,
      recommendationsProgress(),
    );

    emit({ type: 'stage', stage: 'finalizing', progress: finalizingProgress() });
    const ok = !cancelled && engines.every((engine) => engine.status !== 'failed');
    const failedCount = engines.filter((engine) => engine.status === 'failed').length;
    const report: LiveReport = {
      command,
      root,
      projectName: project.name,
      status: cancelled ? 'cancelled' : 'completed',
      ok,
      jsonOutput,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      filesAnalyzed: files.length,
      excludedSensitiveFiles: [...excludedSensitiveFiles],
      userExcludes: [...userExcludes],
      findings: currentFindings,
      bySeverity: countBySeverity(currentFindings),
      engines,
      ...(ok
        ? {}
        : {
            error: {
              code: cancelled ? 'CANCELLED' : 'ANALYZER_FAILED',
              message: cancelled
                ? 'Scan cancelled before all analyzers completed'
                : `${failedCount} analyzer${failedCount === 1 ? '' : 's'} failed`,
            },
          }),
    };

    emitLog(
      cancelled ? 'WARN' : ok ? 'DONE' : 'ERROR',
      cancelled
        ? 'Scan cancelled'
        : ok
          ? `Scan completed — ${currentFindings.length} finding${currentFindings.length === 1 ? '' : 's'} across ${files.length} files`
          : `Scan finished with analyzer failures — ${currentFindings.length} finding${currentFindings.length === 1 ? '' : 's'}`,
      finalizingProgress(),
    );
    if (jsonOutput) {
      emitLog(
        'INFO',
        JSON.stringify({ ok, findings: currentFindings, engines }),
        finalizingProgress(),
      );
    }
    emit({ type: 'result', report });
    emit({ type: 'status', status: cancelled ? 'cancelled' : 'completed', progress: 100 });
    return report;
  } catch (error: unknown) {
    const failure = describeError(error);
    emitLog('ERROR', `${failure.code}: ${failure.message}`, 0);
    emit({ type: 'error', error: failure, progress: 0 });
    emit({ type: 'status', status: 'failed', progress: 0 });
    const report: LiveReport = {
      command,
      root,
      projectName: '',
      status: 'failed',
      ok: false,
      jsonOutput,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      filesAnalyzed: 0,
      excludedSensitiveFiles: [],
      userExcludes: [],
      findings: [],
      bySeverity: countBySeverity([]),
      engines: [],
      error: failure,
    };
    emit({ type: 'result', report });
    return report;
  }
}
