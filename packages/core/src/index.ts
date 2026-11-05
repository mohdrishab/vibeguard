export type {
  Issue,
  IssueCategory,
  IssueConfidence,
  IssueEvidence,
  IssueLocation,
  IssueStatus,
  Fixability,
} from './issue.js';
export type { ProjectInfo } from './project.js';
export { SEVERITY_RANK, compareSeverity } from './severity.js';
export type { Severity } from './severity.js';

// File-kind predicates (shared by detection and analyzer engines).
export { isJavaScriptLikeFile, isLintableFile, isTypeScriptFile } from './filetypes.js';

// Errors.
export { VibeGuardError } from './errors.js';
export type { VibeGuardErrorCode } from './errors.js';

// Shared/fs utilities.
export { isRecord, pathExists, toPosix } from './utils.js';

// package.json handling.
export { allDependencyNames, normalizePackageJson, parsePackageJson } from './packagejson.js';
export type { PackageJsonLite } from './packagejson.js';

// Project intelligence.
export { analyzeProject, analyzeProjectDetailed } from './project/analyze.js';
export type { AnalyzeOptions, AnalyzeResult } from './project/analyze.js';
export {
  detectFrameworks,
  detectLanguages,
  detectPackageManager,
  findProjectRoot,
  parsePackageManagerField,
  requireProjectJsonDir,
} from './project/detect.js';
export { DEFAULT_EXCLUDES, indexFiles } from './project/files.js';
export type { IndexFilesOptions, IndexResult } from './project/files.js';
export { isSensitiveFile } from './project/secrets.js';

// Configuration.
export { CONFIG_FILE_NAME, loadConfig, serializeConfig, writeConfig } from './config/load.js';
export type { ResolvedConfig, WriteConfigOptions } from './config/load.js';
export { defaultConfig, vibeguardConfigSchema } from './config/schema.js';
export type { VibeGuardConfig } from './config/schema.js';
