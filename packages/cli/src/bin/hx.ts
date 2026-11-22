#!/usr/bin/env node
import fs from 'node:fs';
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { VERSION } from '@hx/shared';
import { loadConfig } from '@hx/core';
import { runDoctor, formatDoctorTable } from '../doctor/index.js';
import { App } from '../ui/App.js';

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

program
  .argument('[prompt]', 'One-shot prompt to execute')
  .option('--model <model>', 'Force a specific model (e.g. llama3.1:8b)')
  .option('--role <role>', 'Role selection (assistant, coder, router)', 'assistant')
  .option('--system <system>', 'Replace role layer with custom system prompt')
  .option('--append-system <text>', 'Append custom instructions to the prompt')
  .option('--system-file <path>', 'Read system prompt override from file')
  .option('--local-only', 'Never use Gemini API or external network models', false)
  .action(async (promptArg: string | undefined, options: {
    model?: string;
    role?: 'assistant' | 'coder' | 'router';
    system?: string;
    appendSystem?: string;
    systemFile?: string;
    localOnly?: boolean;
  }) => {
    try {
      const config = loadConfig();

      let systemOverride = options.system;
      if (options.systemFile) {
        systemOverride = fs.readFileSync(options.systemFile, 'utf-8');
      }

      const isOneShot = Boolean(promptArg && promptArg.trim().length > 0);

      const appElement = React.createElement(App, {
        config,
        initialModel: options.model,
        initialRole: options.role,
        localOnly: options.localOnly,
        systemOverride,
        appendSystem: options.appendSystem,
        initialPrompt: promptArg,
        isOneShot,
      });

      const { waitUntilExit } = render(appElement);
      await waitUntilExit();
    } catch (err) {
      process.stderr.write(`Execution failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

program.parse(process.argv);
