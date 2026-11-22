#!/usr/bin/env node
import { Command } from 'commander';
import { VERSION } from '@hx/shared';
import { runDoctor, formatDoctorTable } from '../doctor/index.js';

const program = new Command();

program
  .name('hx')
  .description('hx: local-first CLI AI agent harness')
  .version(VERSION);

program
  .command('doctor')
  .description('Inspect and verify the local environment and dependencies')
  .option('--json', 'Output report in JSON format')
  .action(async (options: { json?: boolean }) => {
    try {
      const report = await runDoctor();
      if (options.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      } else {
        process.stdout.write(formatDoctorTable(report) + '\n');
      }
      process.exit(report.allPassed ? 0 : 1);
    } catch (err) {
      process.stderr.write(`Doctor execution failed: ${err}\n`);
      process.exit(1);
    }
  });

program.parse(process.argv);
