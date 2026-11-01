# VibeGuard

**AI-powered autonomous codebase auditing and repair CLI for JavaScript and TypeScript projects.**

VibeGuard helps developers — especially vibe coders shipping fast — find, diagnose, prioritize, and automatically fix bugs, security vulnerabilities, performance bottlenecks, inefficient code, and architectural problems in their projects.

Core workflow: **Scan → Detect → Diagnose → Prioritize → Fix → Test → Verify → Report**

> **Status: Phase 1 (CLI + project intelligence) complete.** `init`, `scan`, `config` are live and detect real project stacks. Static analyzers, AI diagnosis, and repair arrive in later phases — see [Roadmap](#roadmap).

## Usage

All commands produce human output by default; add `--json` for stable, machine-readable output.

### `vibeguard init [dir] [--force] [--json]`

Detects the project stack, indexes files, and writes a starter `.vibeguardrc.json`. Existing configs are never overwritten without `--force` (exit code 1, `[CONFIG_EXISTS]` otherwise).

### `vibeguard scan [dir] [--json]`

Project intelligence today: languages, frameworks, package manager, entry points, config inventory, file index (sensitive files are skipped, never read), plus applied excludes from `.vibeguardrc.json`. Findings are an honest `[]` until the static analyzers land in Phase 2.

### `vibeguard config [dir] [--json]`

Shows the resolved configuration — the file's contents when `.vibeguardrc.json` exists, or the defaults when it doesn't (clearly labeled).

### Configuration file

`.vibeguardrc.json` is validated strictly (unknown keys are rejected):

```json
{
  "version": 1,
  "scan": {
    "exclude": ["src/generated/**"]
  }
}
```

### Behavior notes

- **Implicit vs. explicit directories.** Without `[dir]`, VibeGuard walks up to the nearest ancestor with a `package.json`. With an explicit `[dir]`, that exact directory must contain a `package.json` — ancestors are never adopted.
- **Sensitive files are never indexed or read.** `.env*`, private keys (`id_rsa`, `*.pem`, `*.key`, `*.pfx`, …), `.npmrc`, cloud credential files, and `*.tfvars` are skipped and reported by name only. Their contents never reach AI providers.
- **Errors are structured.** Failures print `[CODE] message` with codes like `NO_PROJECT`, `INVALID_PACKAGE_JSON`, `INVALID_CONFIG`, `CONFIG_EXISTS`, and exit `1`.

## Features (planned)

- **Deterministic static analysis** — ESLint + the TypeScript Compiler API catch real bugs with evidence, never speculation.
- **Security auditing** — Semgrep and `npm audit` integration plus VibeGuard's own secret/injection scanners.
- **Performance analysis** — bundle analysis, blocking-operation detection, Lighthouse CI for web apps.
- **Unified issue engine** — every finding gets a stable ID, severity, confidence score, evidence, and fixability rating.
- **AI-powered diagnosis** — optional reasoning layer over OpenAI, Gemini, DeepSeek, or a local Ollama model. Scanning always works without any API key.
- **Autonomous repair** — recovery points, unified diffs, isolated verification (tests, lint, typecheck, build), and rollback on failure. Security-sensitive fixes always require human approval.

## Repository structure

```
packages/
  cli/          Commander-based CLI entry point (@vibeguard/cli → `vibeguard`)
  core/         Shared types and contracts (@vibeguard/core)
  analyzers/    Deterministic static-analysis engines (@vibeguard/analyzers)
  ai/           Provider-independent AI reasoning (@vibeguard/ai)
  repair/       Autonomous patch engine (@vibeguard/repair)
  reports/      HTML / JSON / Markdown report generation (@vibeguard/reports)
```

## Requirements

- Node.js 22+
- pnpm 12+ (`corepack enable`)

## Development

```bash
pnpm install          # install dependencies
pnpm build            # compile all packages (TypeScript project references)
pnpm test             # run all unit tests (Vitest)
pnpm lint             # ESLint (flat config, strict rules)
pnpm format           # Prettier check + write
pnpm test:coverage    # unit tests with coverage report
```

Local CLI during development:

```bash
pnpm build && node packages/cli/dist/index.js --help
```

## Contributing

PRs must come from a feature branch and pass CI (lint, typecheck build, tests). Please open an issue for bugs with a minimal reproduction before submitting a fix. See the templates in [`.github/`](.github/) for details.

- [Engineering instructions and standards](.github/CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## License

[Apache-2.0](LICENSE)

## Roadmap

| Phase | Scope                                                     | Status  |
| ----- | --------------------------------------------------------- | ------- |
| 0     | Monorepo foundation (TS, ESLint, Vitest, CI)              | ✅ Done |
| 1     | CLI, project intelligence, `.vibeguardrc.json`            | ✅ Done |
| 2     | Static analysis & bug detection (ESLint, TSC API)         | 🔜 Next |
| 3     | Security & dependency auditing                            | Planned |
| 4     | Performance analysis                                      | Planned |
| 5     | Unified issue engine                                      | Planned |
| 6     | AI reasoning engine (OpenAI / Gemini / DeepSeek / Ollama) | Planned |
| 7     | Autonomous repair engine                                  | Planned |
| 8     | Prompt generator for external AI agents                   | Planned |
| 9     | Verification & reporting                                  | Planned |
| 10    | Integration, optimization, npm release                    | Planned |
