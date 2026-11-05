import { BlockingOperationsAnalyzer } from './performance/blocking-operations-analyzer.js';
import { BundleAnalyzer } from './performance/bundle-analyzer.js';
import { DependencyAudit } from './security/dependency-audit.js';
import { EslintAnalyzer } from './eslint/analyzer.js';
import { AnalyzerRegistry } from './registry.js';
import { ReactPerformanceAnalyzer } from './performance/react-performance-analyzer.js';
import { SecretScanner } from './security/secret-scanner.js';
import { TsCompilerAnalyzer } from './tsc/analyzer.js';

/**
 * The bundled registry: deterministic engines in a fixed order. ESLint
 * runs before the compiler so parse errors are attributed to the lint
 * engine first and every remaining report comes type-aware. Security
 * engines run last so a scan never fails on a missing lockfile or network
 * while still reporting deterministic bugs first. Performance engines
 * run after security so bugs and vulnerabilities surface before
 * suspected performance issues.
 */
export function createDefaultRegistry(): AnalyzerRegistry {
  const registry = new AnalyzerRegistry();
  registry.register(new EslintAnalyzer());
  registry.register(new TsCompilerAnalyzer());
  registry.register(new SecretScanner());
  registry.register(new DependencyAudit());
  registry.register(new BundleAnalyzer());
  registry.register(new ReactPerformanceAnalyzer());
  registry.register(new BlockingOperationsAnalyzer());
  return registry;
}
