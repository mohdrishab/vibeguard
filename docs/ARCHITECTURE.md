# VibeGuard Architecture

Status as of Phase 1. This document describes the real, implemented layering and the rules that keep it stable.

## Packages

```
┌────────────────────────────────────────────────────────────┐
│ @vibeguard/cli            thin CLI (wiring + formatting)   │
│   src/program.ts          Commander registry               │
│   src/commands/*.ts       command behavior (init/scan/…)   │
│   src/io.ts               injectable stdout/stderr channel │
│   src/ui/                 spinner (TTY-aware) + formatting │
├────────────────────────────────────────────────────────────┤
│ @vibeguard/core           shared contracts + intelligence  │
│   src/issue.ts, project.ts, severity.ts   Phase-0 contracts│
│   src/errors.ts           VibeGuardError + stable codes    │
│   src/packagejson.ts      guarded manifest reader          │
│   src/project/            detect, files, secrets, analyze  │
│   src/config/             .vibeguardrc.json schema + load  │
│   src/testing/            test-only fixtures (not shipped) │
├────────────────────────────────────────────────────────────┤
│ @vibeguard/analyzers      Phase 2+: ESLint, TS Compiler API│
│ @vibeguard/ai             Phase 6+: provider-independent AI│
│ @vibeguard/repair         Phase 7+: safety-gated patches   │
│ @vibeguard/reports        Phase 9+: html/json/markdown out │
└────────────────────────────────────────────────────────────┘
```

Dependency direction is strictly downward: `cli → core`; other packages depend on `core` only. `core` never imports from consumer packages.

## Layer rules

1. **Logic lives in `core`; the CLI stays thin.** Commands parse flags, resolve a root, call core, and format. They contain no detection or analysis logic, so library consumers get the identical behavior without the CLI.
2. **Contracts are additive.** `ProjectInfo` grows (e.g. `entryPoints`, `configFiles` in Phase 1) but never breaks; codes in `VibeGuardErrorCode` are a stable API.
3. **All command output flows through `Io`.** Tests inject `Io` instead of capturing process streams; the default `consoleIo` is the only place `Log`/`error` touches the console.

## Design decisions (Phase 1)

- **Implicit vs. explicit roots.** Without `[dir]`, root resolution walks ancestors to the nearest `package.json` (`findProjectRoot`). With `[dir]`, the exact directory must contain the manifest (`requireProjectJsonDir`) — silently adopting an ancestor manifest is the "ran against my home directory" foot-gun.
- **Package manager priority.** `package.json#packageManager` field first, then lockfile checks in priority order (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock`/`bun.lockb`, `package-lock.json`), defaulting to npm.
- **Sensitive-file policy is name-based and conservative.** `.env*` (deliberately including `.env.example`), private keys/keystores, registry and cloud credential files, and `*.tfvars` are excluded from the index and never read. Cost: a few harmless files are skipped. Benefit: a secret-shaped file can never reach an analyzer, a report, or an AI provider.
- **File ordering is a code-unit sort of POSIX-relative paths.** Sorting happens once, in `indexFiles`, after globbing; consumers must not re-sort. Symlinks are never followed (loop safety).
- **`.vibeguardrc.json` is strict and append-safe.** Unknown keys are rejected (`z.strictObject`), `version` must be exactly `1`, and `writeConfig` uses exclusive create (`'wx'`) so an existing config is never clobbered without `force`.
- **Empty findings are honest.** `scan` reports `findings: []` with `analyzersRun: []` until Phase 2 wires real analyzers — no placeholders or fabricated issues.
- **Spinners are quiet outside TTYs.** Deterministic output for tests, CI, and pipes; all progress signals live on stderr so `--json` stdout stays parseable.

## Error model

`VibeGuardError` (`core/src/errors.ts`) carries a machine code; the CLI renders `[CODE] message` to stderr and exits `1`. Codes:

| Code                   | Throws when                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `NO_PROJECT`           | missing `package.json` where the policy requires one (implicit walk exhausted / explicit dir lacks it / config written to a missing directory) |
| `INVALID_PACKAGE_JSON` | manifest unreadable or not a JSON object                                                                                                       |
| `INVALID_CONFIG`       | `.vibeguardrc.json` unreadable, invalid JSON, or schema-invalid                                                                                |
| `CONFIG_EXISTS`        | config write attempted without `force` onto an existing config                                                                                 |

## Verification per phase

Every phase lands behind the same gate: `pnpm lint`, `pnpm format:check`, `pnpm build` (strict typecheck), `pnpm test` (Vitest, incl. end-to-end tests against the built CLI binary). CI runs the same on Node 22 and 24.
