# Changelog

All notable changes to VibeGuard are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) (adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)).

## [0.2.2] — 2026-11-28

### Fixed

- Published manifests no longer contain unresolved `workspace:*` dependency ranges, so a clean `npm i @closed-door/cli` installs correctly. (0.2.1 must be published with `pnpm publish`, not `npm publish`.)

## [0.2.1] — 2026-11-28

### Fixed

- `scan` no longer crashes with `ruleId.localeCompare is not a function` when `npm audit` returns numeric advisory ids.
- Numeric audit advisory ids are normalized to string rule ids when building findings.
- `--version` now reports the published package version instead of a stale hard-coded `0.1.0`.
- The TypeScript analyzer no longer reports diagnostics from `node_modules`, build output, or other files outside the scan index.
- A `tsconfig.json` with no compiler options no longer falls back to bare TypeScript defaults, which produced false positives such as `TS1259`.

## [0.1.0] — unreleased

### Added

- pnpm monorepo workspace with six packages: `cli`, `core`, `analyzers`, `ai`, `repair`, `reports`.
- Strict TypeScript configuration with project-reference builds (`tsc -b`).
- ESLint (flat config) and Prettier tooling.
- Vitest unit-test setup with coverage reporting.
- GitHub Actions CI workflow (Node 22/24 matrix: lint, format check, build, tests).
- Apache-2.0 license, issue/PR templates, contributing guide.
- CLI skeleton: `vibeguard --version` and `vibeguard --help`.
- Shared type contracts: `Issue`, `ProjectInfo`, severity model.
- Analyzer contract and `AnalyzerRegistry`.
- AI provider contract with environment-based API-key resolution.
- Repair safety-level model (`safe` / `moderate` / `dangerous`).
- Report format contract (`html` / `json` / `markdown`).

- Project intelligence (`@closed-door/core`): project root detection (ancestor walk for implicit cwd, exact-directory policy for explicit `[dir]`), package manager detection (`packageManager` field > lockfile priority > npm default), language family detection with deterministic ordering, framework detection (React, Next.js, Vite, Node.js), full project analyzer (`analyzeProject`/`analyzeProjectDetailed`) with frozen `ProjectInfo` incl. entry points and config inventory.
- File indexing with default excludes (`node_modules`, `.git`, `dist`, `build`, `coverage`, framework caches), user excludes, POSIX-path normalization, deterministic sort, and no symlink traversal.
- Sensitive-file policy: `.env*`, private keys and key stores, registry/cloud credentials, and `*.tfvars` are never indexed or read — names are reported only.
- Structured errors (`VibeGuardError`) with stable codes: `NO_PROJECT`, `INVALID_PACKAGE_JSON`, `INVALID_CONFIG`, `CONFIG_EXISTS`.
- Strictly validated `.vibeguardrc.json` (`version: 1`, strict-object schema via zod) with defaults, atomic non-overwrite writes (`CONFIG_EXISTS` without `--force`), and `serializeConfig` stability.
- CLI commands: `vibeguard init [dir] [--force] [--json]`, `vibeguard scan [dir] [--json]`, `vibeguard config [dir] [--json]` with human and machine output modes.
- Injectable I/O layer, TTY-aware spinner (silent in non-TTY for deterministic output), chalk-formatted human summaries.
- `[CODE] message` error rendering with exit code 1.
