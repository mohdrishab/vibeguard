import type { Fixability, IssueCategory, Severity } from '@closed-door/core';

/**
 * Explicit rule metadata for the checks worth calling out. Everything
 * else falls back to the conservative default so adding rules never
 * mislabels severity/categories.
 *
 * The tables cover eslint's recommended set plus typescript-eslint's
 * recommended set. Defaults: severity 'medium', category 'code-quality' —
 * only rule-specific overrides can claim 'high' or a bug category.
 */

const DEFAULT_META: Readonly<{ severity: Severity; category: IssueCategory }> = Object.freeze({
  severity: 'medium',
  category: 'code-quality',
});

interface RuleMeta {
  readonly severity: Severity;
  readonly category: IssueCategory;
  readonly recommendation?: string;
}

const RULE_META: Readonly<Record<string, RuleMeta>> = Object.freeze({
  // Runtime-breaking candidates: these eslint rules fire before a real
  // crash is even attempted at runtime.
  'no-undef': {
    severity: 'high',
    category: 'bug',
    recommendation:
      'Declare, import, or correct the spelling of the identifier before running; on TypeScript files the compiler owns this check.',
  },
  'no-unreachable': {
    severity: 'high',
    category: 'bug',
    recommendation:
      'Move the statement above the controlling return/throw/break, or delete the dead code.',
  },
  'no-this-before-super': {
    severity: 'high',
    category: 'bug',
    recommendation: 'Call super() before any this-usage in a derived constructor.',
  },
  'constructor-super': {
    severity: 'high',
    category: 'bug',
    recommendation: 'Call super() exactly once in a derived class constructor.',
  },
  'no-unsafe-finally': {
    severity: 'high',
    category: 'bug',
    recommendation: 'Keep finally free of control transfers (return/throw/break/continue).',
  },

  // Deterministic-bug outcome class.
  'getter-return': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Return a value on every code path of the getter.',
  },
  'no-async-promise-executor': {
    severity: 'medium',
    category: 'bug',
    recommendation:
      'Never pass an async executor to the Promise constructor — its rejections are swallowed. Call an async function instead.',
  },
  'no-compare-neg-zero': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Use Object.is(x, -0) when -0 matters; otherwise use plain comparisons.',
  },
  'no-constant-condition': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Make the conditional expression depend on runtime state.',
  },
  'no-dupe-args': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Rename duplicated function parameters; earlier ones are silently shadowed.',
  },
  'no-dupe-else-if': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Flatten the duplicated else-if into one condition.',
  },
  'no-dupe-keys': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Remove or rename one of the duplicated keys — the last one silently wins.',
  },
  'no-duplicate-case': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Merge or differentiate the duplicated switch cases.',
  },
  'no-fallthrough': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Add break/return, or an explicit intent comment.',
  },
  'no-import-assign': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Mutate imported module members through the exporting module API instead.',
  },
  'no-loss-of-precision': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Round or store the number literal in a safer representation.',
  },
  'no-misleading-character-class': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Escape combining/surrogate character classes; prefer u/v flag semantics.',
  },
  'no-new-native-nonconstructor': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Symbol/BigInt are called without new.',
  },
  'no-obj-calls': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Math/JSON/Reflect are namespaces — never call them as functions.',
  },
  'no-prototype-builtins': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Prefer Object.hasOwn(obj, key) over calling members on raw objects.',
  },
  'no-self-assign': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Assign the intended other value instead of self-assigning.',
  },
  'no-unsafe-negation': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Parenthesize the negation: !(a in b), not !a in b.',
  },
  'no-unsafe-optional-chaining': {
    severity: 'medium',
    category: 'bug',
    recommendation:
      'Null-check before chaining in positions that must evaluate (arithmetic, calls).',
  },
  'no-setter-return': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Remove the return value from setters — it is discarded and misleading.',
  },
  'use-isnan': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Compare with Number.isNaN/isNaN instead of === NaN.',
  },
  'valid-typeof': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Switch on real string type names.',
  },
  'no-func-assign': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Do not overwrite function declarations — they are hoisted.',
  },
  'no-redeclare': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Rename one of the declarations; duplicates let the last one win.',
  },
  'no-const-assign': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Re-declare as let, or rename the binding; const must not be reassigned.',
  },
  'no-dupe-class-members': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Deduplicate or rename the class member; duplicates silently override.',
  },
  'no-class-assign': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Assign to a variable instead of reassigning the class binding.',
  },
  'no-template-curly-in-string': {
    severity: 'low',
    category: 'bug',
    recommendation: 'Use a proper template literal (backticks) instead of a plain string.',
  },
  'no-cond-assign': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Split the assignment from the condition; extra parentheses hide real intent.',
  },
  'no-shadow-restricted-names': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Rename the shadowing variable; undefined/NaN/Infinity are reserved.',
  },
  'for-direction': {
    severity: 'medium',
    category: 'bug',
    recommendation: 'Fix the loop counter direction (it never moves toward exit).',
  },

  // Code-quality class, low severity.
  'no-unused-vars': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Remove the unused binding or underscore-prefix it per local convention.',
  },
  '@typescript-eslint/no-unused-vars': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Remove the unused binding or underscore-prefix it per local convention.',
  },
  '@typescript-eslint/no-explicit-any': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Replace any with a precise type, or unknown plus narrowing.',
  },
  '@typescript-eslint/ban-ts-comment': {
    severity: 'medium',
    category: 'code-quality',
    recommendation:
      'Replace @ts-ignore with an explained @ts-expect-error, or fix the real type error.',
  },
  '@typescript-eslint/no-array-constructor': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Use array literals or Array.from instead of new Array(…).',
  },
  '@typescript-eslint/no-require-imports': {
    severity: 'medium',
    category: 'code-quality',
    recommendation: 'Use ES import statements instead of CommonJS require.',
  },
  '@typescript-eslint/no-extra-non-null-assertion': {
    severity: 'low',
    category: 'bug',
    recommendation: 'Remove the doubled non-null assertion; one is already meaningful.',
  },
  '@typescript-eslint/no-unsafe-declaration-merging': {
    severity: 'medium',
    category: 'code-quality',
    recommendation: 'Document or separate the intentional declaration merge.',
  },
  '@typescript-eslint/no-unsafe-function-type': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Reference concrete function types instead of Function.',
  },
  '@typescript-eslint/no-unnecessary-type-constraint': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Remove the redundant extends clause — any is the implicit bound.',
  },
  '@typescript-eslint/no-empty-object-type': {
    severity: 'low',
    category: 'code-quality',
    recommendation:
      'Use Record<string, never> for an empty object type or name the intended shape.',
  },
  '@typescript-eslint/no-duplicate-enum-values': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Give enum members distinct values or document the alias explicitly.',
  },

  // Low-severity code-quality leftovers.
  'no-empty': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Fill the block intent or document why it is intentionally empty.',
  },
  'no-control-regex': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Escape the control characters inside the regex literal.',
  },
  'no-debugger': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Remove the debugger statement.',
  },
  'no-ex-assign': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Do not reassign the caught exception binding.',
  },
  'no-sparse-arrays': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Use explicit undefined or fill the sparse slots.',
  },
  'no-regex-spaces': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Use a quantifier ({2}) instead of literal repeated spaces.',
  },
  'no-irregular-whitespace': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Replace irregular whitespace with regular whitespace characters.',
  },
  'no-empty-pattern': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Do not destructure into an empty pattern.',
  },
  'no-inner-declarations': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Hoist function declarations out of nested blocks for clarity.',
  },
  'no-useless-catch': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Remove the try/catch that only rethrows.',
  },
  'no-useless-escape': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Remove literal escapes of characters that need none.',
  },
  'no-unused-labels': {
    severity: 'low',
    category: 'code-quality',
    recommendation: 'Remove the unused label.',
  },
});

export function ruleMeta(ruleId: string): RuleMeta {
  const meta = RULE_META[ruleId];
  return meta ?? { ...DEFAULT_META, recommendation: undefined };
}

/**
 * No Phase-2 lint rule earns 'critical' — that severity is reserved for
 * security findings (Phase 3+). The guard means a future mapping edit can
 * never silently upgrade a lint finding to critical.
 */
export function clampSeverityForLint(severity: Severity): Severity {
  return severity === 'critical' ? 'high' : severity;
}

/** ESLint messages with attached fix metadata are the bundled autofix class. */
export function fixabilityFromMessage(fixable: boolean): Fixability {
  return fixable ? 'auto-safe' : 'manual-only';
}

/** Public doc URL for the originating engine's rule. */
export function ruleDocUrl(ruleId: string): string {
  if (ruleId.startsWith('@typescript-eslint/')) {
    const name = ruleId.slice('@typescript-eslint/'.length);
    return `https://typescript-eslint.io/rules/${name}/`;
  }
  return `https://eslint.org/docs/latest/rules/${ruleId}`;
}
