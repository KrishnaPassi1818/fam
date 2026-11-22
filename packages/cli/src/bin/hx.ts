#!/usr/bin/env node
import fs from 'node:fs';
import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { VERSION } from '@hx/shared';
import { loadConfig } from '@hx/core';
import { runDoctor, formatDoctorTable } from '../doctor/index.js';
import { listServers, testServer, saveServerConfig, removeServerConfig } from '../mcp/index.js';
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

const mcpCmd = program.command('mcp').description('Manage and inspect configured MCP servers');

mcpCmd
  .command('list')
  .description('List configured MCP servers and their transport status')
  .option('--json', 'Output list in JSON format')
  .action((options: { json?: boolean }) => {
    try {
      const config = loadConfig();
      const servers = listServers(config);
      if (options.json) {
        process.stdout.write(JSON.stringify(servers, null, 2) + '\n');
      } else {
        process.stdout.write('Configured MCP Servers:\n');
        process.stdout.write(`${'NAME'.padEnd(16)} | ${'TRANSPORT'.padEnd(10)} | ${'AUTOSTART'.padEnd(10)} | COMMAND/URL\n`);
        process.stdout.write('-'.repeat(70) + '\n');
        for (const s of servers) {
          const autoStr = s.autoStart ? 'yes' : 'no';
          process.stdout.write(
            `${s.name.padEnd(16)} | ${s.transport.padEnd(10)} | ${autoStr.padEnd(10)} | ${s.commandOrUrl}\n`,
          );
        }
      }
    } catch (err) {
      process.stderr.write(`Failed to list MCP servers: ${err}\n`);
      process.exit(1);
    }
  });

mcpCmd
  .command('test <name>')
  .description('Connect to an MCP server, query its tools, and test responsiveness')
  .action(async (name: string) => {
    try {
      const config = loadConfig();
      process.stdout.write(`Testing MCP server '${name}'...\n`);
      const res = await testServer(name, config);
      if (res.success) {
        process.stdout.write(`✓ Server '${name}' responded in ${res.durationMs}ms\n`);
        process.stdout.write(`  Found ${res.toolCount} tool(s): ${res.tools.join(', ')}\n`);
      } else {
        process.stderr.write(`✖ Server '${name}' test failed: ${res.error}\n`);
        process.exit(1);
      }
    } catch (err) {
      process.stderr.write(`Failed to test MCP server: ${err}\n`);
      process.exit(1);
    }
  });

mcpCmd
  .command('add <name> [command] [args...]')
  .description('Register a new MCP server configuration')
  .option('--transport <type>', 'Transport type (stdio or http)', 'stdio')
  .option('--url <url>', 'URL for http transport')
  .option('--auto-start', 'Automatically start server at harness initialization', false)
  .action((name: string, command: string | undefined, args: string[], options: {
    transport?: 'stdio' | 'http';
    url?: string;
    autoStart?: boolean;
  }) => {
    try {
      saveServerConfig(name, {
        transport: options.transport,
        command,
        args,
        url: options.url,
        autoStart: options.autoStart,
        enabled: true,
      });
      process.stdout.write(`Added MCP server '${name}' to ~/.harness/servers.toml\n`);
    } catch (err) {
      process.stderr.write(`Failed to add MCP server: ${err}\n`);
      process.exit(1);
    }
  });

mcpCmd
  .command('remove <name>')
  .description('Remove an MCP server configuration')
  .action((name: string) => {
    try {
      const removed = removeServerConfig(name);
      if (removed) {
        process.stdout.write(`Removed MCP server '${name}' from ~/.harness/servers.toml\n`);
      } else {
        process.stdout.write(`Server '${name}' not found in ~/.harness/servers.toml\n`);
      }
    } catch (err) {
      process.stderr.write(`Failed to remove MCP server: ${err}\n`);
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
