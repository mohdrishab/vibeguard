# Contributing to VibeGuard

Thanks for contributing! VibeGuard is an open-source, production-oriented developer tool, and these standards keep it reliable.

## Engineering standards

- **Strict TypeScript.** All code compiles under `strict` plus `noUncheckedIndexedAccess`. New files must not loosen settings.
- **Tests required.** Every feature ships with unit tests (Vitest). Bug fixes ship with a regression test that fails without the fix.
- **No placeholders.** No fake scan results, mocked implementations in production code, TODO-only functions, or hardcoded API keys.
- **Evidence over claims.** Do not report speculative findings as confirmed bugs; every emitted issue carries evidence. Do not claim a feature works without executing its tests.
- **Modularity.** Small, focused modules with interfaces at package boundaries. Cross-package code goes through `@vibeguard/core` contracts.
- **Secrets.** API keys live in environment variables only. Never log, echo, store, or transmit secrets — reports must never contain secret values.
- **User data safety.** Never overwrite uncommitted user changes; never silently delete user files.

## Workflow

1. Open a bug/feature issue first for anything non-trivial (templates provided).
2. Create a feature branch from `main`: `git checkout -b feat/your-feature`.
3. Implement with tests alongside.
4. Before opening a PR, run the full gate:

   ```bash
   pnpm lint        # ESLint
   pnpm format:check
   pnpm build       # strict typecheck via project references
   pnpm test        # Vitest
   ```

5. Open the PR using the template. CI must be green before review.

## Commit messages

Conventional Commits style: `type(scope): short imperative summary`

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

## Pull requests

- One logical change per PR.
- Describe what changed, why, and test evidence (commands executed, pass/fail).
- Update `README.md` and docs when behavior or architecture changes.

## Reporting security issues

Do not open public issues for vulnerabilities. Use GitHub's private security reporting ("Report a vulnerability" on the repository Security tab).

## License

By contributing, you agree your contributions are licensed under the Apache-2.0 license.
