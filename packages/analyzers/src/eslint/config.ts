import eslintJs from '@eslint/js';
import type { Linter } from 'eslint';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Files that are never lint-scanned by VibeGuard even when the project
 * index should not contain them (belt-and-braces against derived/minified
 * code polluting findings).
 */
export const ENGINE_IGNORES: readonly string[] = Object.freeze([
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/.vibeguard/**',
]);

/**
 * Bundled, deterministic global scope: the ES2022 standard library plus the
 * browser and Node platforms. Scan targets are arbitrary JS/TS projects and
 * VibeGuard deliberately does not read or follow their (often missing)
 * eslint configs, so declaring a broad-but-standard scope keeps `no-undef`
 * meaningful instead of firing on every `console`/`window`/`process`. TS
 * files do not lean on this — the typescript-eslint recommended set turns
 * `no-undef` off for them because the compiler enforces declarations.
 */
const ENGINE_GLOBALS: Readonly<Record<string, boolean>> = Object.freeze({
  ...globals.es2022,
  ...globals.browser,
  ...globals.node,
});

/**
 * Builds the bundled non-type-aware lint configuration:
 *
 * 1. ignore list for derived/vendor code,
 * 2. bundled language options (globals, module source type),
 * 3. eslint `recommended` — the JS runtime checks,
 * 4. typescript-eslint `recommended` (schema-verified array of three
 *    entries: global parser wiring, TS-scoped core-rule disables, and the
 *    TS rule set), spread only when TS sources are present,
 * 5. a CommonJS language override for `.cjs`.
 *
 * No project config is consulted: scans must be deterministic on projects
 * that ship no ESLint setup at all (`overrideConfigFile: true` in the
 * analyzer enforces that).
 */
export function buildOverrideConfig(tsEnabled: boolean): Linter.Config[] {
  const configs: Linter.Config[] = [
    { ignores: [...ENGINE_IGNORES] },
    { languageOptions: { sourceType: 'module', globals: { ...ENGINE_GLOBALS } } },
    eslintJs.configs.recommended as Linter.Config,
  ];
  if (tsEnabled) {
    configs.push(...(tseslint.configs.recommended as Linter.Config[]));
  }
  configs.push({
    files: ['**/*.cjs'],
    languageOptions: {
      parser: tseslint.parser,
      sourceType: 'commonjs',
      globals: { ...ENGINE_GLOBALS },
    },
  });
  return configs;
}
