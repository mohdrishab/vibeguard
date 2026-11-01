# VibeGuard

**AI-powered autonomous codebase auditing and repair CLI for JavaScript and TypeScript projects.**

VibeGuard helps developers — especially vibe coders shipping fast — find, diagnose, prioritize, and automatically fix bugs, security vulnerabilities, performance bottlenecks, inefficient code, and architectural problems in their projects.

Core workflow: **Scan → Detect → Diagnose → Prioritize → Fix → Test → Verify → Report**

> **Status: Phase 0 (repository foundation) complete.** The CLI exposes `--version` and `--help` only. Scanning, analysis, and repair are under active development — see [Roadmap](#roadmap).

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
| 1     | CLI, project intelligence, `.vibeguardrc.json`            | 🔜 Next |
| 2     | Static analysis & bug detection (ESLint, TSC API)         | Planned |
| 3     | Security & dependency auditing                            | Planned |
| 4     | Performance analysis                                      | Planned |
| 5     | Unified issue engine                                      | Planned |
| 6     | AI reasoning engine (OpenAI / Gemini / DeepSeek / Ollama) | Planned |
| 7     | Autonomous repair engine                                  | Planned |
| 8     | Prompt generator for external AI agents                   | Planned |
| 9     | Verification & reporting                                  | Planned |
| 10    | Integration, optimization, npm release                    | Planned |
