import { existsSync } from 'node:fs';
import path from 'node:path';

import { isTypeScriptFile } from '@vibeguard/core';
import type { Issue, ProjectInfo, Severity } from '@vibeguard/core';
import * as ts from 'typescript';

import type { Analyzer } from '../analyzer.js';
import { buildIssue, captureSnippet, relativePosix } from '../issues.js';

const TSC_ID = 'tsc';
const TSC_NAME = 'TypeScript Compiler';
const TITLE_MAX_LENGTH = 140;

/**
 * Emit-kill switches that guarantee `createProgram` never writes to disk
 * regardless of what the scanned project's tsconfig requests.
 */
const NO_EMIT_OVERRIDES: ts.CompilerOptions = {
  composite: false,
  incremental: false,
  declaration: false,
  declarationMap: false,
  emitDeclarationOnly: false,
  isolatedDeclarations: false,
  noEmit: true,
};

export class TsCompilerAnalyzer implements Analyzer {
  public readonly id = TSC_ID;
  public readonly name = TSC_NAME;

  /**
   * The compiler check applies whenever the project contains at least one
   * TypeScript source file.
   */
  public applicability(
    project: ProjectInfo,
  ): { kind: 'applicable' } | { kind: 'not-applicable'; reason: string } {
    if (!project.files.some((file) => isTypeScriptFile(file))) {
      return {
        kind: 'not-applicable',
        reason: 'No TypeScript sources to type-check.',
      };
    }
    return { kind: 'applicable' };
  }

  public async analyze(project: ProjectInfo): Promise<readonly Issue[]> {
    const tsFiles = project.files.filter((file) => isTypeScriptFile(file)).sort();
    if (tsFiles.length === 0) {
      return [];
    }

    const { rootNames, options, configFileParsingDiagnostics } = resolveProgramConfiguration(
      project,
      tsFiles,
    );
    const program = ts.createProgram({ rootNames, options, configFileParsingDiagnostics });
    const diagnostics = ts.getPreEmitDiagnostics(program);

    const issues: Issue[] = [];
    for (const diagnostic of diagnostics) {
      const issue = await this.toIssue(project, diagnostic);
      if (issue !== undefined) {
        issues.push(issue);
      }
    }
    return issues;
  }

  /**
   * Maps one compiler diagnostic to the shared issue contract.
   *
   * Configuration-level diagnostics (no source file, or the tsconfig
   * source itself) are reported against `<projectRoot>/tsconfig.json`
   * when that file exists and skipped otherwise, so a scan never
   * fabricates a location that is not on disk. Diagnostics located
   * outside the project root (ambient `@types` libs resolved from
   * ancestor node_modules directories) are out of scan scope — the
   * scan never inspected that code — and are skipped with the reverse
   * reasoning: a scan does not report files that are not its business.
   */
  private async toIssue(
    project: ProjectInfo,
    diagnostic: ts.Diagnostic,
  ): Promise<Issue | undefined> {
    const relativeFile = diagnostic.file
      ? relativePosix(project.root, diagnostic.file.fileName)
      : configLocation(project.root);
    if (relativeFile === undefined) {
      return undefined;
    }
    if (diagnostic.file !== undefined && relativeFile.startsWith('..')) {
      return undefined;
    }

    const start = diagnostic.start ?? 0;
    const end = diagnostic.start !== undefined ? start + (diagnostic.length ?? 0) : start;
    const startLine = diagnostic.file?.getLineAndCharacterOfPosition(start).line ?? 0;
    const startColumn = diagnostic.file?.getLineAndCharacterOfPosition(start).character ?? 0;
    const endLine = diagnostic.file?.getLineAndCharacterOfPosition(end).line ?? startLine;

    const flattened = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    const firstLine = flattened.split('\n')[0] ?? '';
    const title =
      firstLine.length > 0
        ? truncate(firstLine, TITLE_MAX_LENGTH)
        : `TypeScript diagnostic TS${diagnostic.code}`;
    // Config problems usually carry the tsconfig as their source file;
    // truly file-less ones fall back to the config location.
    const configLevel = relativeFile === 'tsconfig.json';

    return buildIssue({
      category: 'bug',
      severity: severityFromDiagnostic(diagnostic),
      title,
      description:
        `${flattened}\n\n` +
        (configLevel
          ? `Configuration-level diagnostic (TS${diagnostic.code}): the fix belongs in the TypeScript configuration (${relativeFile}), not application code.`
          : `This is a compiler-verified diagnostic (TS${diagnostic.code}) at ` +
            `${relativeFile}:${startLine + 1}:${startColumn + 1}.`),
      file: relativeFile,
      startLine: startLine + 1,
      endLine: endLine + 1,
      startColumn: startColumn + 1,
      recommendation: configLevel
        ? `Correct or remove the rejected option/path in ${relativeFile} (diagnostic TS${diagnostic.code}) so the compiler applies the intended settings.`
        : `Resolve the compiler error (${relativeFile}:${startLine + 1}). ` +
          'Run `tsc --noEmit` locally to reproduce the diagnostic and confirm the fix.',
      fixability: 'manual-only',
      source: TSC_ID,
      evidence: [
        {
          ruleId: `TS${diagnostic.code}`,
          ...(diagnostic.file !== undefined
            ? { snippet: await captureSnippet(project.root, relativeFile, startLine + 1) }
            : {}),
        },
      ],
    });
  }
}

/**
 * Resolves the program root names and compiler options:
 *
 * - When a real `tsconfig.json` exists (not a solution-style reference-only
 *   config), its file list and strictness are respected as-is.
 * - Otherwise a deterministic permissive preset is used: non-strict,
 *   ES2022 target/libs, bundler-style resolution, no allowJs — JavaScript
 *   files are lint engine territory, not compiler territory.
 *
 * Regardless of source, the {@link NO_EMIT_OVERRIDES} switches are always
 * forced so the program is guaranteed side-effect free.
 */
function resolveProgramConfiguration(
  project: ProjectInfo,
  tsFiles: readonly string[],
): {
  rootNames: readonly string[];
  options: ts.CompilerOptions;
  configFileParsingDiagnostics: readonly ts.Diagnostic[];
} {
  const configPath = path.join(project.root, 'tsconfig.json');
  const parsed = existsSync(configPath)
    ? parseConfig(configPath)
    : { fatalDiagnostics: [] as readonly ts.Diagnostic[] };
  const configFiles = parsed.commandLine?.fileNames ?? [];

  // Solution-style configs (references only) yield no file names even
  // though TS sources exist; fall back to the scan index for those.
  const rootNames = configFiles.length > 0 ? configFiles : projectFiles(tsFiles, project.root);

  const baseOptions = parsed.commandLine?.options ?? permissiveOptions();
  return {
    rootNames,
    options: {
      ...baseOptions,
      ...NO_EMIT_OVERRIDES,
      // Drop stale emit-only residue that noEmit makes meaningless but
      // which can still confuse the program builder.
      tsBuildInfoFile: undefined,
      outDir: undefined,
      declarationDir: undefined,
    },
    // Surface tsconfig problems ("Unknown compiler option", broken JSON…)
    // instead of silently checking the project against half-applied
    // options. Config-level diagnostics carry no source file and map to
    // `tsconfig.json` in {@link TsCompilerAnalyzer.toIssue}.
    configFileParsingDiagnostics: [
      ...(parsed.commandLine?.errors ?? []),
      ...parsed.fatalDiagnostics,
    ],
  };
}

/**
 * Parses the project's tsconfig.json without any dependency on process
 * cwd: the host roots every instruction at the config location.
 *
 * Even unrecoverable config-file problems are recorded as diagnostics
 * rather than lost, so broken configs surface as issues instead of
 * silently degrading the scan to the permissive preset.
 */
interface ConfigParseOutcome {
  readonly commandLine?: ts.ParsedCommandLine;
  readonly fatalDiagnostics: readonly ts.Diagnostic[];
}

function parseConfig(configPath: string): ConfigParseOutcome {
  const fatalDiagnostics: ts.Diagnostic[] = [];
  try {
    const host: ts.ParseConfigFileHost = {
      useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
      getCurrentDirectory: () => path.dirname(configPath),
      readDirectory: ts.sys.readDirectory,
      readFile: ts.sys.readFile,
      fileExists: ts.sys.fileExists,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        fatalDiagnostics.push(diagnostic);
      },
    };
    // Extended-resolution options deliberately default-only: no compiler
    // behavioral tweak shall leak from VibeGuard into the project's config.
    return {
      commandLine: ts.getParsedCommandLineOfConfigFile(configPath, undefined, host),
      fatalDiagnostics,
    };
  } catch {
    // A malformed tsconfig that the parser cannot even handle falls back
    // to the permissive preset; whatever diagnostics were recorded still
    // surface as program diagnostics with tsconfig.json location.
    return { fatalDiagnostics };
  }
}

function permissiveOptions(): ts.CompilerOptions {
  return {
    ...NO_EMIT_OVERRIDES,
    strict: false,
    allowJs: false,
    checkJs: false,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    esModuleInterop: true,
    skipLibCheck: true,
  };
}

/**
 * Absolute paths for the scan index entries that belong inside the project
 * root — the default program input when no usable tsconfig exists.
 */
function projectFiles(tsFiles: readonly string[], projectRoot: string): readonly string[] {
  return tsFiles
    .filter((file) => !file.startsWith('../'))
    .map((file) => path.join(projectRoot, ...file.split('/')));
}

/**
 * `<projectRoot>/tsconfig.json`, POSIX-style, when the file is present on
 * disk — used as the canonical location for config-level diagnostics.
 */
function configLocation(projectRoot: string): string | undefined {
  return existsSync(path.join(projectRoot, 'tsconfig.json')) ? 'tsconfig.json' : undefined;
}

function severityFromDiagnostic(diagnostic: ts.Diagnostic): Severity {
  switch (diagnostic.category) {
    case ts.DiagnosticCategory.Error:
      return 'high';
    case ts.DiagnosticCategory.Warning:
      return 'medium';
    default:
      return 'low';
  }
}

/** Truncates (with an ellipsis marker) without cutting mid-ideographic. */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}
