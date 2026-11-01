# Changelog

All notable changes to VibeGuard are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) (adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)).

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
