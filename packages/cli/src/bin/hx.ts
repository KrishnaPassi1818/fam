#!/usr/bin/env node
import fs from 'node:fs';
import { Command } from 'commander';
import { VERSION } from '@hx/shared';
import { loadConfig, Tracer, MemoryService, AgentLoop, PermissionGate } from '@hx/core';
import { McpHost } from '@hx/mcp-host';
import { runDoctor, formatDoctorTable } from '../doctor/index.js';
import { listServers, testServer, saveServerConfig, removeServerConfig } from '../mcp/index.js';
import { loadAllTasks, EvalRunner, saveEvalReport, formatMarkdownReport } from '@hx/evals';
import { createAdapter, launchRatatuiTui, runHeadlessBridge } from '../ui/index.js';

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
  .command('replay <run>')
  .description('Replay a past agent run step-by-step from trace logs')
  .action(async (run: string) => {
    try {
      const traceFile = Tracer.findTraceFile(run);
      if (!traceFile) {
        process.stderr.write(`Error: Trace run '${run}' not found in ~/.harness/traces/\n`);
        process.exit(1);
      }
      const events = await Tracer.readTrace(traceFile);
      const lines = Tracer.renderReplay(events);
      for (const line of lines) {
        process.stdout.write(line + '\n');
      }
    } catch (err) {
      process.stderr.write(`Failed to replay trace: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

const traceCmd = program.command('trace').description('Inspect and analyze execution traces');

traceCmd
  .command('stats <run>')
  .description('Compute token, latency, and tool-use statistics from a trace run')
  .option('--json', 'Output stats in JSON format')
  .action(async (run: string, options: { json?: boolean }) => {
    try {
      const traceFile = Tracer.findTraceFile(run);
      if (!traceFile) {
        process.stderr.write(`Error: Trace run '${run}' not found in ~/.harness/traces/\n`);
        process.exit(1);
      }

      const events = await Tracer.readTrace(traceFile);
      const stats = Tracer.computeStats(events);

      if (options.json) {
        process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
      } else {
        process.stdout.write(`Trace Statistics for Run: ${stats.runId}\n`);
        process.stdout.write(`- Duration: ${stats.durationMs}ms\n`);
        process.stdout.write(`- Total Steps: ${stats.steps}\n`);
        process.stdout.write(`- Total Tokens: ${stats.totalTokens}\n`);
        process.stdout.write(`- Models Used: ${stats.modelsUsed.join(', ') || 'none'}\n`);
        process.stdout.write(`- Tool Calls: ${stats.toolCallsCount}\n`);
        for (const [t, c] of Object.entries(stats.toolsUsed)) {
          process.stdout.write(`  • ${t}: ${c}\n`);
        }
        process.stdout.write(`- Errors: ${stats.errorsCount}\n`);
        process.stdout.write(`- Total Events: ${stats.eventsCount}\n`);
      }
    } catch (err) {
      process.stderr.write(`Failed to compute trace stats: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

program
  .command('eval')
  .description('Run evaluation suite against models and score performance')
  .option('--suite <name>', 'Suite filter (e.g. smoke)', 'smoke')
  .option('--task <id>', 'Run a specific task ID')
  .option('--model <model>', 'Model to evaluate (e.g. llama3.1:8b)')
  .option('--json', 'Output raw JSON report')
  .action(async (options: {
    suite?: string;
    task?: string;
    model?: string;
    json?: boolean;
  }) => {
    try {
      const config = loadConfig();
      const modelId =
        options.model ||
        (program.opts()['model'] as string | undefined) ||
        config.general.defaultModel ||
        'llama3.1:8b';
      const adapter = createAdapter({ modelId, config, localOnly: false });

      let tasks = loadAllTasks();
      if (options.suite) {
        tasks = tasks.filter((t) => t.suite === options.suite);
      }
      if (options.task) {
        tasks = tasks.filter((t) => t.id === options.task);
      }

      if (tasks.length === 0) {
        process.stderr.write(`No eval tasks found matching criteria (suite: ${options.suite}, task: ${options.task})\n`);
        process.exit(1);
      }

      process.stdout.write(`Running ${tasks.length} eval task(s) on model '${modelId}'...\n`);
      const runner = new EvalRunner();
      const report = await runner.runSuite(tasks, adapter);
      const saved = saveEvalReport(report);

      if (options.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      } else {
        process.stdout.write('\n' + formatMarkdownReport(report) + '\n');
        process.stdout.write(`\nSaved scoreboard:\n- JSON: ${saved.jsonPath}\n- Markdown: ${saved.mdPath}\n`);
      }

      process.exit(report.scorePercent >= 100 ? 0 : 1);
    } catch (err) {
      process.stderr.write(`Eval execution failed: ${err instanceof Error ? err.message : String(err)}\n`);
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

const memoryCmd = program.command('memory').description('Inspect and manage persistent long-term memory');

memoryCmd
  .command('list')
  .description('List stored memories')
  .option('--project', 'Show only current project memories')
  .action((options: { project?: boolean }) => {
    try {
      const memService = new MemoryService();
      const items = memService.list(options.project ? { scope: memService.getProjectScope() } : {});
      if (items.length === 0) {
        process.stdout.write('No memories found.\n');
        return;
      }
      for (const item of items) {
        process.stdout.write(`- [${item.id}] (${item.kind}, ${item.scope}, ${item.privacy}): ${item.text}\n`);
      }
    } catch (err) {
      process.stderr.write(`Failed to list memories: ${err}\n`);
      process.exit(1);
    }
  });

memoryCmd
  .command('search <query>')
  .description('Search stored memories using vector similarity')
  .action(async (query: string) => {
    try {
      const memService = new MemoryService();
      const results = await memService.retrieve(query, { limit: 10 });
      if (results.length === 0) {
        process.stdout.write(`No memories matched query "${query}".\n`);
        return;
      }
      process.stdout.write(`Found ${results.length} relevant memories:\n`);
      for (const r of results) {
        process.stdout.write(`- (score: ${r.finalScore.toFixed(3)}) [${r.memory.id}]: ${r.memory.text}\n`);
      }
    } catch (err) {
      process.stderr.write(`Failed to search memories: ${err}\n`);
      process.exit(1);
    }
  });

memoryCmd
  .command('forget <id>')
  .description('Delete a specific memory by its ID')
  .action((id: string) => {
    try {
      const memService = new MemoryService();
      const deleted = memService.forget(id);
      if (deleted) {
        process.stdout.write(`Deleted memory '${id}'.\n`);
      } else {
        process.stdout.write(`Memory '${id}' not found.\n`);
      }
    } catch (err) {
      process.stderr.write(`Failed to delete memory: ${err}\n`);
      process.exit(1);
    }
  });

memoryCmd
  .command('wipe')
  .description('Wipe all stored memories and sessions from ~/.harness/db/memory.sqlite')
  .action(() => {
    try {
      const memService = new MemoryService();
      memService.wipe();
      process.stdout.write('Wiped all memories and session records.\n');
    } catch (err) {
      process.stderr.write(`Failed to wipe memory: ${err}\n`);
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
  .option('-y, --yes', 'Automatically approve all tool execution permissions', false)
  .option('--headless', 'Run harness in headless IPC bridge mode for TUI', false)
  .action(async (promptArg: string | undefined, options: {
    model?: string;
    role?: 'assistant' | 'coder' | 'router';
    system?: string;
    appendSystem?: string;
    systemFile?: string;
    localOnly?: boolean;
    yes?: boolean;
    headless?: boolean;
  }) => {
    try {
      const config = loadConfig();

      let systemOverride = options.system;
      if (options.systemFile) {
        systemOverride = fs.readFileSync(options.systemFile, 'utf-8');
      }

      const sessionConfig = {
        config,
        initialModel: options.model,
        initialRole: options.role,
        localOnly: options.localOnly,
        systemOverride,
        appendSystem: options.appendSystem,
        initialPrompt: promptArg,
      };

      if (options.headless) {
        await runHeadlessBridge(sessionConfig);
        return;
      }

      const isOneShot = Boolean(promptArg && promptArg.trim().length > 0);
      if (isOneShot) {
        const modelId = options.model || config.general.defaultModel || 'llama3.1:8b';
        const adapter = createAdapter({
          modelId,
          config,
          localOnly: options.localOnly,
        });
        const profile = config.models.models[modelId];
        const tier = (profile as unknown as { tier?: string })?.tier || (modelId.includes('gemini') ? 'full' : modelId.includes('1.5b') ? 'min' : 'medium');

        let tools = undefined;
        let toolHandlers = undefined;
        let mcpHost: McpHost | undefined;

        if (config.servers?.servers) {
          try {
            mcpHost = new McpHost({
              servers: config.servers.servers,
            });
            await mcpHost.initAutoStartServers();
            tools = await mcpHost.getTools(true);
            toolHandlers = await mcpHost.getToolHandlers();
          } catch (err) {
            process.stderr.write(`Warning: Failed to initialize MCP servers: ${err instanceof Error ? err.message : String(err)}\n`);
          }
        }

        const memoryService = new MemoryService();
        const permissionGate = new PermissionGate();
        if (options.yes || isOneShot) {
          permissionGate.grantSession('*');
        }

        const loop = new AgentLoop({
          adapter,
          tracer: new Tracer(),
          memoryService,
          permissionGate,
          role: options.role || 'assistant',
          tier: tier as 'full' | 'medium' | 'min',
          userGlobalPrompt: systemOverride,
          projectPrompt: options.appendSystem,
          tools,
          toolHandlers,
        });

        for await (const event of loop.run([{ role: 'user', content: promptArg! }])) {
          if (event.type === 'chunk') {
            process.stdout.write(event.delta);
          } else if (event.type === 'tool_call') {
            process.stderr.write(`[tool: ${event.toolCall.name}]\n`);
          } else if (event.type === 'finish') {
            process.stdout.write('\n');
          }
        }
        if (mcpHost) {
          await mcpHost.shutdown();
        }
        process.exit(0);
      }

      // Interactive mode: launch Rust Ratatui TUI!
      await launchRatatuiTui(sessionConfig);
    } catch (err) {
      process.stderr.write(`Execution failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

program.parse(process.argv);
