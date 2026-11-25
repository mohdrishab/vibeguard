# VibeGuard

**Local-first JavaScript and TypeScript project scanner with deterministic checks and evidence-backed findings.**

VibeGuard currently provides project detection and a read-only scan using ESLint, the TypeScript compiler, a secret-pattern scanner, dependency audit, and heuristic React/Node performance checks. It does **not** currently diagnose or repair issues with AI.

Current workflow: **Inspect → Analyze → Prioritize → Report in the terminal or JSON**

> **Status: early prototype.** `init`, `scan`, and `config` are implemented. AI diagnosis, repair, verification, and report-file generation are not implemented yet — see [Roadmap](#roadmap).

## Interactive console (in your terminal)

Run `vibeguard` with no arguments in a TTY, or `vibeguard repl`, to open the interactive scan console. Everything happens in the terminal — no browser, server or dashboard is involved.

```
vibeguard ❯ scan .
```

The console runs the real scanner and streams: a stage timeline, a progress bar tied to completed work, timestamped `[INFO] / [SCAN] / [WARN] / [PASS] / [DONE]` events, and findings as analyzers finish. When the scan ends, an interactive split-pane report opens:

- `↑` / `↓` (or `j` / `k`) select a finding; the right pane shows its evidence, explanation and recommended fix.
- `0`–`4` filter by severity, `c` cycles categories, `s` changes sort order, `/` searches titles and paths.
- `q` or `Esc` closes the report and returns to the prompt.
- `Ctrl+C` cancels a running scan (partial results are labeled as cancelled).
- `help`, `status`, `history`, `clear` and `exit` are also available at the prompt.

Piped input and non-TTY environments get plain deterministic output instead of the animated frame. Set `VIBEGUARD_REDUCED_MOTION=1` to disable in-place animation; `NO_COLOR` is honored by Chalk.

## Usage

All commands produce human output by default; add `--json` for stable, machine-readable output.

### `vibeguard init [dir] [--force] [--json]`

Detects the project stack, indexes files, and writes a starter `.vibeguardrc.json`. Existing configs are never overwritten without `--force` (exit code 1, `[CONFIG_EXISTS]` otherwise).

### `vibeguard scan [dir] [--json]`

Detects project languages/frameworks/package manager, indexes eligible files, and runs the bundled analyzers. JSON output includes findings and per-analyzer `passed`, `failed`, or `skipped` status; the command exits non-zero if an applicable analyzer fails. Findings are deduplicated only when rule, title, and precise location match.

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

## Current scan checks

- **ESLint** — bundled recommended JavaScript and TypeScript rules; does not load the project's ESLint config.
- **TypeScript** — compiler diagnostics using the project `tsconfig.json` when available; never emits build files.
- **Secrets** — pattern checks for common tokens and credentials in indexed JavaScript/TypeScript source. Matches are marked `suspected`; all matched values on each evidence line are redacted.
- **Dependencies** — npm or pnpm audit when dependencies are present and the matching lockfile is indexed. Audit findings may require registry/network access; failed checks are reported as failed, not as zero vulnerabilities.
- **React / Node heuristics** — regex-based checks for selected JSX and blocking-operation patterns. These findings are marked `suspected`; they are not AST or runtime performance measurements.
- **Bundle heuristics** — selected large-dependency and asset-import hints, also marked `suspected`.

`scan` is read-only. VibeGuard does not yet provide fix, verify, AI diagnosis, prompt generation, or report-file commands. JSON output is available with `--json`.

## Repository structure

```
packages/
  cli/          Commander-based CLI entry point (@closed-door/cli → `vibeguard`)
  core/         Shared types and project intelligence (@closed-door/core)
  analyzers/    ESLint, TypeScript, security, and heuristic checks (@closed-door/analyzers)
  ai/           Provider key resolution only; AI diagnosis is not implemented
  repair/       Safety classification only; patch application is not implemented
  reports/      Report format definitions only; report generation is not implemented
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

| Phase | Scope                                                     | Status                                   |
| ----- | --------------------------------------------------------- | ---------------------------------------- |
| 0     | Monorepo foundation (TS, ESLint, Vitest, CI)              | ✅ Done                                  |
| 1     | CLI, project intelligence, `.vibeguardrc.json`            | ✅ Done                                  |
| 2     | Static analysis & bug detection (ESLint, TSC API)         | ✅ Prototype implemented                 |
| 3     | Security & dependency auditing                            | ✅ Prototype implemented                 |
| 4     | Performance analysis                                      | ⚠️ Heuristic prototype only              |
| 5     | Unified issue engine                                      | ⚠️ Basic exact deduplication implemented |
| 6     | AI reasoning engine (OpenAI / Gemini / DeepSeek / Ollama) | Not implemented                          |
| 7     | Autonomous repair engine                                  | Not implemented                          |
| 8     | Prompt generator for external AI agents                   | Not implemented                          |
| 9     | Verification & report-file generation                     | Not implemented                          |
| 10    | Integration, optimization, npm release                    | Planned                                  |
