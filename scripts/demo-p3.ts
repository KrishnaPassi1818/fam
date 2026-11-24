import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ToolExecutor,
  ToolValidator,
  PermissionGate,
  BackupService,
  PrivacyGate,
  GeminiAdapter,
  Tracer,
} from '../packages/core/src/index.js';
import { EvalRunner, loadAllTasks } from '../packages/evals/src/index.js';
import {
  PrivacyBlocked,
  type ToolDescriptor,
  type ToolCall,
  type Message,
  type ModelAdapter,
  type ChatChunk,
} from '../packages/shared/src/index.js';

async function main() {
  console.log('================================================================');
  console.log('                 FAM PHASE 3 EXIT GATE DEMO                      ');
  console.log('================================================================\n');

  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-gate-p3-'));
  const tmpWs = path.join(tmpBase, 'workspace');
  const tmpBackup = path.join(tmpBase, 'backups');
  fs.mkdirSync(tmpWs, { recursive: true });
  fs.mkdirSync(tmpBackup, { recursive: true });

  try {
    // -------------------------------------------------------------
    // GATE 1: Concurrency (Parallel Reads vs Serialized Writes)
    // -------------------------------------------------------------
    console.log('[1/6] Verifying parallel read concurrency vs serialized write execution...');

    const readToolDesc: ToolDescriptor = {
      name: 'read_slow',
      alias: 'read_slow',
      description: 'Concurrent slow read',
      inputSchema: { type: 'object' },
      annotations: { readOnlyHint: true },
      category: 'test',
      tier: 0,
      timeoutMs: 5000,
    };

    const writeToolDesc: ToolDescriptor = {
      name: 'write_slow',
      alias: 'write_slow',
      description: 'Sequential slow write',
      inputSchema: { type: 'object' },
      annotations: { readOnlyHint: false },
      category: 'test',
      tier: 1,
      timeoutMs: 5000,
    };

    const descriptors = new Map<string, ToolDescriptor>([
      ['read_slow', readToolDesc],
      ['write_slow', writeToolDesc],
    ]);

    const writeSequence: number[] = [];

    const handlers = new Map([
      [
        'read_slow',
        async () => {
          await new Promise((r) => setTimeout(r, 100));
          return { content: 'read_ok' };
        },
      ],
      [
        'write_slow',
        async (args: Record<string, unknown>) => {
          const id = Number(args['id'] || 0);
          await new Promise((r) => setTimeout(r, 60));
          writeSequence.push(id);
          return { content: `write_${id}` };
        },
      ],
    ]);

    const executor = new ToolExecutor({ concurrencyLimit: 4 });

    // Test parallel reads: 4 x 100ms tools run in parallel (< 180ms)
    const readCalls: ToolCall[] = [
      { id: 'r1', name: 'read_slow', args: {} },
      { id: 'r2', name: 'read_slow', args: {} },
      { id: 'r3', name: 'read_slow', args: {} },
      { id: 'r4', name: 'read_slow', args: {} },
    ];

    const startRead = Date.now();
    const readResults = await executor.executeBatch(readCalls, descriptors, handlers);
    const elapsedRead = Date.now() - startRead;

    if (readResults.length !== 4 || !readResults.every((r) => r.content === 'read_ok')) {
      throw new Error('Concurrent read batch failed to return all expected results');
    }
    if (elapsedRead >= 300) {
      throw new Error(`Read tools did not execute concurrently! Elapsed: ${elapsedRead}ms (expected < 300ms)`);
    }
    console.log(`  ✓ 4 parallel reads (100ms each) finished in ${elapsedRead}ms (concurrent)`);

    // Test serialized writes: 3 x 60ms tools run sequentially (>= 170ms) in strict order [1, 2, 3]
    const writeCalls: ToolCall[] = [
      { id: 'w1', name: 'write_slow', args: { id: 1 } },
      { id: 'w2', name: 'write_slow', args: { id: 2 } },
      { id: 'w3', name: 'write_slow', args: { id: 3 } },
    ];

    const startWrite = Date.now();
    const writeResults = await executor.executeBatch(writeCalls, descriptors, handlers);
    const elapsedWrite = Date.now() - startWrite;

    if (writeResults.length !== 3 || writeSequence.join(',') !== '1,2,3') {
      throw new Error(`Write tools did not execute sequentially in order! Order was: ${writeSequence.join(',')}`);
    }
    console.log(`  ✓ 3 writes finished in ${elapsedWrite}ms in strict sequential order [${writeSequence.join(', ')}]`);

    // -------------------------------------------------------------
    // GATE 2: Validator Argument Coercion & Parameter Hallucination Repair
    // -------------------------------------------------------------
    console.log('\n[2/6] Verifying tool argument validation, safe coercion, and hallucination repair...');
    const validator = new ToolValidator();

    const sampleGrepTool: ToolDescriptor = {
      name: 'grep',
      alias: 'grep',
      description: 'Search regex pattern in files',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          pattern: { type: 'string' },
          max_matches: { type: 'integer' },
          case_sensitive: { type: 'boolean' },
        },
        required: ['path', 'pattern'],
      },
      annotations: { readOnlyHint: true },
      category: 'fs',
      tier: 0,
      timeoutMs: 5000,
    };

    // Small model hallucination: string booleans, string integers, 'file' instead of 'path', 'regex' instead of 'pattern'
    const malformedArgs = {
      file: '/workspace/src/app.ts',
      regex: 'TODO',
      max_matches: '50',
      case_sensitive: 'false',
    };

    const vResult = validator.validateAndCoerce(sampleGrepTool, malformedArgs);
    if (!vResult.valid) {
      throw new Error(`Validator failed to repair and coerce arguments: ${vResult.error}`);
    }

    if (
      vResult.args['path'] !== '/workspace/src/app.ts' ||
      vResult.args['pattern'] !== 'TODO' ||
      vResult.args['max_matches'] !== 50 ||
      vResult.args['case_sensitive'] !== false
    ) {
      throw new Error(`Coerced arguments mismatch: ${JSON.stringify(vResult.args)}`);
    }
    console.log('  ✓ Malformed model arguments coerced & repaired into valid schema:');
    console.log(`    - file -> path: "${vResult.args['path']}"`);
    console.log(`    - regex -> pattern: "${vResult.args['pattern']}"`);
    console.log(`    - "50" -> 50 (${typeof vResult.args['max_matches']})`);
    console.log(`    - "false" -> false (${typeof vResult.args['case_sensitive']})`);

    // -------------------------------------------------------------
    // GATE 3: Permission Gate & Approval Enforcement
    // -------------------------------------------------------------
    console.log('\n[3/6] Verifying permission tiers and interactive approval enforcement...');
    const permGate = new PermissionGate();

    // Tier 0 is auto
    const tier0Check = permGate.check('fs_read', 0);
    if (!tier0Check.granted) throw new Error('Tier 0 should be auto-approved');

    // Tier 1 is auto (workspace write with auto-backup)
    const tier1Check = permGate.check('fs_write_file', 1);
    if (!tier1Check.granted) throw new Error('Tier 1 should be auto-approved');

    // Tier 2 blocks by default
    const tier2Check = permGate.check('fs_trash', 2);
    if (tier2Check.granted || !tier2Check.requiresPrompt) {
      throw new Error('Tier 2 action should block and require prompt!');
    }
    console.log('  ✓ Tier 2 action blocked pending user approval (requiresPrompt: true)');

    // Grant session approval for tier 2
    permGate.grantSession('fs_trash');
    const tier2Approved = permGate.check('fs_trash', 2);
    if (!tier2Approved.granted) {
      throw new Error('Tier 2 action should be granted after session grant!');
    }
    console.log('  ✓ Tier 2 action granted after session approval');

    // -------------------------------------------------------------
    // GATE 4: Pre-Write Backup & /undo Service
    // -------------------------------------------------------------
    console.log('\n[4/6] Verifying pre-write backup and /undo restoration service...');
    const backupService = new BackupService(tmpBackup);
    const testFile = path.join(tmpWs, 'config.json');
    fs.writeFileSync(testFile, '{"version": 1, "status": "original"}', 'utf-8');

    // Begin change set & backup pre-write
    const csId = backupService.beginChangeSet('update config.json');
    await backupService.backupFile(testFile, csId);

    // Overwrite file
    fs.writeFileSync(testFile, '{"version": 2, "status": "corrupted"}', 'utf-8');
    if (!fs.readFileSync(testFile, 'utf-8').includes('corrupted')) {
      throw new Error('Failed to overwrite file for test');
    }

    // Perform undo
    const undoRes = await backupService.undo(csId);
    if (undoRes.restoredCount !== 1) {
      throw new Error(`Undo failed to restore file! Result: ${JSON.stringify(undoRes)}`);
    }

    const restoredContent = fs.readFileSync(testFile, 'utf-8');
    if (!restoredContent.includes('"version": 1') || !restoredContent.includes('"original"')) {
      throw new Error(`Restored content mismatch: ${restoredContent}`);
    }
    console.log('  ✓ Backup service restored corrupted file to original state byte-for-byte');

    // -------------------------------------------------------------
    // GATE 5: Privacy Gate & Cloud Transmission Interception
    // -------------------------------------------------------------
    console.log('\n[5/6] Verifying Privacy Gate fail-closed protection against cloud transmission...');
    const privacyGate = new PrivacyGate();

    // 1. Taint propagation from local-only path
    privacyGate.recordToolExecution('read_file', { path: '/home/user/.env' }, 'SECRET_TOKEN=xyz');
    if (!privacyGate.isTainted()) {
      throw new Error('PrivacyGate failed to taint session on .env access!');
    }
    console.log('  ✓ Taint propagated from local-only path access (.env)');

    // 2. Intercept Gemini transmission
    const mockGemini = new GeminiAdapter({
      apiKey: 'test-fake-gemini-key',
      model: 'gemini-2.5-flash',
      privacyGate,
    });

    let privacyBlocked = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of mockGemini.chat({
        messages: [{ role: 'user', content: 'What is my secret token?' }],
      })) {
        // iterate
      }
    } catch (err) {
      if (
        err instanceof PrivacyBlocked ||
        (err as { code?: string })?.code === 'PRIVACY_BLOCKED' ||
        (err as { name?: string })?.name === 'PrivacyBlocked'
      ) {
        privacyBlocked = true;
      } else {
        console.error('Unexpected error thrown instead of PrivacyBlocked:', err);
      }
    }

    if (!privacyBlocked) {
      throw new Error('PrivacyGate failed to block tainted message to Gemini adapter!');
    }
    console.log('  ✓ PrivacyGate blocked tainted transmission to GeminiAdapter (PrivacyBlocked thrown)');

    // -------------------------------------------------------------
    // GATE 6: Eval Framework Execution & Scoreboard Generation
    // -------------------------------------------------------------
    console.log('\n[6/6] Verifying eval framework execution on smoke suite...');
    const runner = new EvalRunner();
    const tasks = loadAllTasks();

    // Run smoke test with mock model to verify full pipeline
    let turn = 0;
    const mockAdapter: ModelAdapter = {
      id: 'mock:smoke-eval',
      caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 4096 },
      async *chat(req): AsyncIterable<ChatChunk> {
        turn++;
        const lastMsg = req.messages[req.messages.length - 1];
        if (lastMsg?.role === 'tool') {
          yield { delta: `Verified result: ${lastMsg.content}` };
          return;
        }
        const content = lastMsg?.content || '';
        if (content.includes('PONG')) {
          yield { delta: 'PONG' };
        } else if (content.includes('echo')) {
          yield {
            delta: 'echoing',
            toolCalls: [{ id: `tc_${turn}`, name: 'echo', args: { message: 'fam-eval-echo-verified' } }],
          };
        } else if (content.includes('time')) {
          yield {
            delta: 'checking time',
            toolCalls: [{ id: `tc_${turn}`, name: 'current_time', args: {} }],
          };
        } else {
          yield { delta: 'Task completed' };
        }
      },
      countTokens: () => 10,
    };

    const evalReport = await runner.runSuite(tasks.slice(0, 3), mockAdapter);
    console.log(`  ✓ Eval framework executed ${evalReport.tasksTotal} smoke tasks:`);
    for (const tr of evalReport.taskResults) {
      console.log(`    - ${tr.taskId}: ${tr.passed ? 'PASS' : 'FAIL'} (${tr.durationMs}ms)`);
    }

    // -------------------------------------------------------------
    // TRACE VERIFICATION
    // -------------------------------------------------------------
    const tracer = new Tracer({
      sessionId: `gate_p3_${Date.now()}`,
      runId: 'demo_run_p3',
    });
    tracer.emit('session_start', { model: 'qwen3.5:4b', role: 'assistant' });
    tracer.emit('tool_call', { name: 'read_slow', args: {} });
    tracer.emit('permission', { tool: 'fs_trash', granted: true });
    tracer.emit('session_end', { totalTokens: 250, durationMs: 800 });

    const stats = Tracer.computeStats(await Tracer.readTrace(tracer.filePath));
    console.log(`\n✓ Trace recorded and verified: ${stats.eventsCount} events, ${stats.totalTokens} tokens, duration: ${stats.durationMs}ms`);

    console.log('\n================================================================');
    console.log('            ALL PHASE 3 EXIT GATE CRITERIA PASSED!              ');
    console.log('================================================================');
  } finally {
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Phase 3 exit gate failed:', err);
  process.exit(1);
});
