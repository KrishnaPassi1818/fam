import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { OllamaAdapter, AgentLoop, Tracer } from '../packages/core/src/index.js';
import { McpHost } from '../packages/mcp-host/src/index.js';
import type { Message } from '../packages/shared/src/index.js';

async function main() {
  console.log('================================================================');
  console.log('                 FAM PHASE 2 EXIT GATE DEMO                      ');
  console.log('================================================================\n');

  const rootDir = process.cwd();
  const binaryPath = path.resolve(rootDir, 'target/debug/fam-fs');
  const fixtureScript = path.resolve(rootDir, 'packages/mcp-host/fixtures/fake-mcp-server.ts');
  const tracesDir = path.join(os.homedir(), '.harness', 'traces');

  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Rust fs binary not found at ${binaryPath}. Run cargo build --package fam-fs first.`);
  }

  // STEP 1: Initialize MCP Host with Rust fs server and third-party server through config
  console.log('[1/4] Starting MCP Host with Rust fam-fs and third-party fixture server...');
  const mcpHost = new McpHost({
    servers: {
      fs: {
        transport: 'stdio',
        command: binaryPath,
        args: ['--root', rootDir],
        autoStart: true,
      },
      third_party_fixture: {
        transport: 'stdio',
        command: 'npx',
        args: ['tsx', fixtureScript],
        autoStart: true,
      },
    },
  });

  await mcpHost.initAutoStartServers();

  const allTools = await mcpHost.getTools(false);
  const toolNames = allTools.map((t) => t.name);
  console.log(`  Discovered ${allTools.length} tools across configured servers:`);
  console.log(`  - fs tools: ${toolNames.filter((n) => n.startsWith('fs.')).join(', ')}`);
  console.log(`  - third-party tools: ${toolNames.filter((n) => n.startsWith('third_party_fixture.')).join(', ')}`);

  if (!toolNames.includes('fs.grep') || !toolNames.includes('fs.repo_map')) {
    throw new Error('Rust fs server failed to register required tools!');
  }
  if (!toolNames.includes('third_party_fixture.echo')) {
    throw new Error('Third-party fixture server failed to register tools through config alone!');
  }
  console.log('✓ Multi-server MCP host configuration verified.');

  // STEP 2: Verify direct third-party tool execution through config
  console.log('\n[2/4] Testing third-party server tool execution (third_party_fixture.add)...');
  const addResult = await mcpHost.callTool('third_party_fixture.add', { a: 100, b: 250 });
  if (addResult.isError || !addResult.content.includes('350')) {
    throw new Error(`Third party fixture execution failed: ${addResult.content}`);
  }
  console.log(`✓ Third-party server executed successfully: ${addResult.content}`);

  // STEP 3: Setup qwen3.5:4b Agent Loop with fs tools
  console.log('\n[3/4] Running qwen3.5:4b Agent Loop with MCP fs tools (grep TODOs)...');
  const tracer = new Tracer({
    traceDir: tracesDir,
    sessionId: `gate_p2_${Date.now()}`,
    runId: 'demo_run',
  });

  const adapter = new OllamaAdapter({
    model: 'qwen3.5:4b',
    numCtx: 4096,
  });

  // Use alias names for small model tool-calling stability (e.g. fs_grep)
  const modelTools = await mcpHost.getTools(true);
  const toolHandlers = await mcpHost.getToolHandlers();

  const loop = new AgentLoop({
    adapter,
    tracer,
    tools: modelTools,
    toolHandlers,
    role: 'assistant',
    tier: 'medium',
    maxSteps: 5,
  });

  const messages: Message[] = [
    {
      role: 'user',
      content: 'Call the fs_grep tool with pattern "TODO" to search for TODO comments in this codebase.',
    },
  ];

  let toolWasCalled = false;
  let toolNameCalled = '';

  for await (const event of loop.run(messages)) {
    if (event.type === 'tool_call') {
      toolWasCalled = true;
      toolNameCalled = event.toolCall.name;
      console.log(`  -> Emitted tool call: ${event.toolCall.name}(${JSON.stringify(event.toolCall.args)})`);
    } else if (event.type === 'tool_result') {
      const summary = event.toolResult.content.length > 120
        ? event.toolResult.content.substring(0, 117) + '...'
        : event.toolResult.content;
      console.log(`  <- Received tool result: ${summary}`);
    } else if (event.type === 'chunk') {
      process.stdout.write(event.delta);
    } else if (event.type === 'finish') {
      console.log(`\n  Turn completed in ${event.steps} step(s), tokens used: ${event.totalTokens}`);
    }
  }

  if (!toolWasCalled) {
    throw new Error('qwen3.5:4b did not emit any tool call!');
  }
  console.log(`✓ Agent loop executed tool call '${toolNameCalled}' successfully.`);

  // STEP 4: Verify Trace and Shutdown
  console.log('\n[4/4] Verifying trace persistence and graceful shutdown...');
  const traceEvents = await Tracer.readTrace(tracer.filePath);
  console.log(`  Trace events recorded: ${traceEvents.length}`);
  const hasToolCall = traceEvents.some((e) => e.type === 'tool_call');
  const hasToolResult = traceEvents.some((e) => e.type === 'tool_result');

  if (!hasToolCall || !hasToolResult) {
    throw new Error('Trace missing tool_call or tool_result events!');
  }

  await mcpHost.shutdown();
  console.log('✓ McpHost shutdown cleanly.');

  console.log('\n================================================================');
  console.log('           ALL PHASE 2 ACCEPTANCE CRITERIA SATISFIED!           ');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('\n❌ Phase 2 Exit Gate Failed:', err);
  process.exit(1);
});
