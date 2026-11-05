/**
 * Demonstration: Deduplication of analyzer findings
 *
 * This script runs all three performance analyzers on a test project
 * and shows how deduplicateIssues consolidates overlapping findings.
 */

import { createTestProject, minimalPackageJson, packageJsonText } from '@vibeguard/testing';
import { BundleAnalyzer } from './packages/analyzers/src/bundle-analyzer.js';
import { ReactPerformanceAnalyzer } from './packages/analyzers/src/react-performance-analyzer.js';
import { BlockingOperationsAnalyzer } from './packages/analyzers/src/blocking-operations-analyzer.js';
import { deduplicateIssues } from './packages/analyzers/src/unified-issues.js';

async function main() {
  console.log('=== Phase 5: Unified Issue Engine Demonstration ===\n');

  // Create a test project with dependencies that trigger multiple analyzers
  const project = await createTestProject({
    'package.json': packageJsonText(
      minimalPackageJson({
        dependencies: {
          lodash: '^4.17.0',
          react: '^19.0.0',
        },
      }),
    ),
    'src/List.tsx': 'items.map(item => <div>{item}</div>)\n',
    'src/App.tsx': '<Button onClick={() => doSomething()} />\n',
    'src/server.ts': "const data = fs.readFileSync('file.txt');\n",
  });

  const root = project.root;
  project.dispose();

  // projectInfo helpers
  const projectInfo = (overrides = {}) => ({
    root,
    name: 'demo-project',
    languages: ['typescript'],
    frameworks: ['React', 'Node.js'],
    packageManager: 'npm' as const,
    dependencies: ['lodash', 'react'],
    scripts: { start: 'node server.js' },
    files: ['package.json', 'src/List.tsx', 'src/App.tsx', 'src/server.ts'],
    entryPoints: [],
    configFiles: [],
    ...overrides,
  });

  // Run all three analyzers
  const bundleAnalyzer = new BundleAnalyzer();
  const reactAnalyzer = new ReactPerformanceAnalyzer();
  const blockingAnalyzer = new BlockingOperationsAnalyzer();

  console.log('--- Running all three performance analyzers ---\n');

  const bundleIssues = (await bundleAnalyzer.analyze(projectInfo({ frameworks: [] }))) as never;

  const reactIssues = (await reactAnalyzer.analyze(
    projectInfo({ frameworks: ['React'], dependencies: ['react'] }),
  )) as never;

  const blockingIssues = (await blockingAnalyzer.analyze(
    projectInfo({ frameworks: ['Node.js'], scripts: { start: 'node server.js' } }),
  )) as never;

  console.log(`BundleAnalyzer: ${bundleIssues.length} issues`);
  console.log(`ReactPerformanceAnalyzer: ${reactIssues.length} issues`);
  console.log(`BlockingOperationsAnalyzer: ${blockingIssues.length} issues\n`);

  // Combine all issues
  const allIssues = [...bundleIssues, ...reactIssues, ...blockingIssues];
  console.log(`Total before deduplication: ${allIssues.length}\n`);

  // Deduplicate
  const deduped = deduplicateIssues(allIssues);

  console.log(`Total after deduplication: ${deduped.length}\n`);
  console.log('--- Deduplicated Issues ---\n');

  deduped.forEach((issue, i) => {
    console.log(`[${i + 1}] ${issue.source}: ${issue.title}`);
    console.log(
      `     Severity: ${issue.severity} | Location: ${issue.location.file}:${issue.location.startLine}`,
    );
    console.log(`     ID: ${issue.id}`);
    console.log(`     Confidence: ${issue.confidence}`);
    if (issue.evidence?.[0]?.snippet) {
      console.log(
        `     Evidence: ${issue.evidence[0].snippet.substring(0, 100)}${issue.evidence[0].snippet.length > 100 ? '…' : ''}`,
      );
    }
    console.log();
  });

  console.log('=== Demonstration Complete ===');
}

main().catch(console.error);
