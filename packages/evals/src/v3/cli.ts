#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import { V3BenchmarkRunner } from './runner.js';
import { V3Reporter } from './reporter.js';
import type { DomainCategory, DifficultyLevel, SplitType } from './types.js';

const program = new Command();

program
  .name('fam-bench-v3')
  .description('FAM Autonomous Agent Evolution V3 Benchmark Runner')
  .option('--all', 'Run complete 314-task multi-domain benchmark suite', false)
  .option('--domain <domain>', 'Filter by domain category')
  .option('--split <split>', 'Filter by split (dev, val, holdout)')
  .option('--difficulty <level>', 'Filter by difficulty level (1 to 5)')
  .option('--limit <n>', 'Limit maximum tasks to run', (val: string) => parseInt(val, 10))
  .option('--model <model>', 'Target model identifier', 'ollama:qwen3.5:4b')
  .option('--baseline', 'Record as baseline evaluation', false)
  .option('--output-md <path>', 'Custom Markdown output path')
  .option('--output-json <path>', 'Custom JSON output path')
  .action(async (options: {
    all?: boolean;
    domain?: string;
    split?: string;
    difficulty?: string;
    limit?: number;
    model?: string;
    baseline?: boolean;
    outputMd?: string;
    outputJson?: string;
  }) => {
    try {
      console.log('===============================================================');
      console.log(' FAM AUTONOMOUS AGENT EVOLUTION V3 — BENCHMARK HARNESS');
      console.log('===============================================================');
      console.log(`Target Model: ${options.model}`);
      if (options.domain) console.log(`Domain Filter: ${options.domain}`);
      if (options.split) console.log(`Split Filter: ${options.split}`);
      if (options.difficulty) console.log(`Difficulty Filter: ${options.difficulty}`);
      if (options.limit) console.log(`Task Limit: ${options.limit}`);

      const runner = new V3BenchmarkRunner({
        model: options.model,
        domain: options.domain as DomainCategory | undefined,
        split: options.split as SplitType | undefined,
        difficulty: options.difficulty ? (parseInt(options.difficulty, 10) as DifficultyLevel) : undefined,
        limit: options.limit,
        verbose: true,
      });

      console.log('Loading tasks and executing evaluation suite...');
      const report = await runner.runSuite();

      console.log('\n---------------------------------------------------------------');
      console.log(`EVALUATION COMPLETED: ${report.passedTasks} / ${report.totalTasks} PASSED (${report.completionRate}%)`);
      console.log(`Grounded Verification: ${report.verifiedTasks} / ${report.totalTasks} (${report.verifiedCompletionRate}%)`);
      console.log(`Average Rubric Score: ${report.averageScore} / 100`);
      console.log('---------------------------------------------------------------\n');

      const isBaseline = options.baseline;
      const defaultMdPath = isBaseline
        ? path.resolve(process.cwd(), 'reports/v3/BASELINE_EVALUATION.md')
        : path.resolve(process.cwd(), 'reports/v3/BENCHMARK_EVALUATION.md');

      const defaultJsonPath = isBaseline
        ? path.resolve(process.cwd(), 'reports/v3/baseline-results.json')
        : path.resolve(process.cwd(), 'reports/v3/benchmark-results.json');

      const mdPath = options.outputMd || defaultMdPath;
      const jsonPath = options.outputJson || defaultJsonPath;
      const reportTitle = isBaseline
        ? 'FAM Autonomous Agent Evolution V3 — Baseline Evaluation Report'
        : 'FAM Autonomous Agent Evolution V3 — Final Benchmark Evaluation Report';

      V3Reporter.saveReport(report, jsonPath, mdPath, reportTitle);

      process.exit(report.unsafeTasks > 0 ? 1 : 0);
    } catch (err) {
      console.error(`Benchmark execution failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
