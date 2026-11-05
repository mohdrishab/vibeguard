import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    // The analyzers build real TypeScript programs (`createProgram`, which
    // re-parses the standard libs on every call). That is legitimately
    // slower than Vitest's 5s default, especially with parallel workers
    // contending for CPU. 30s is a generous ceiling: a genuinely hung
    // analysis still trips the timeout.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/*.test.ts'],
      reporter: ['text-summary', 'html'],
    },
  },
});
