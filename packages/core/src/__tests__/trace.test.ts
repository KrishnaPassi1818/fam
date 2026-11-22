import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Tracer } from '../trace/index.js';
import { AgentLoop } from '../loop/index.js';
import type { ModelAdapter, ChatChunk, ChatRequest } from '@hx/shared';

describe('Tracer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-trace-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('emits structured trace events to JSONL file', async () => {
    const tracer = new Tracer({
      traceDir: tmpDir,
      sessionId: 'sess_1',
      runId: 'run_1',
    });

    tracer.emit('session_start', { user: 'tester', cwd: '/tmp' });
    tracer.emit('tool_call', { step: 1, callId: 'c1', name: 'echo', args: { msg: 'hi' } });
    tracer.emit('tool_result', { step: 1, callId: 'c1', name: 'echo', content: 'hi', isError: false });
    tracer.emit('session_end', { step: 1, totalTokens: 42, durationMs: 120 });

    expect(fs.existsSync(tracer.filePath)).toBe(true);

    const events = await Tracer.readTrace(tracer.filePath);
    expect(events).toHaveLength(4);
    expect(events[0]?.type).toBe('session_start');
    expect(events[0]?.sessionId).toBe('sess_1');
    expect(events[0]?.runId).toBe('run_1');
    expect(events[1]?.type).toBe('tool_call');
    expect(events[2]?.type).toBe('tool_result');
    expect(events[3]?.type).toBe('session_end');
  });

  it('redacts sensitive secrets before writing to disk', async () => {
    const tracer = new Tracer({
      traceDir: tmpDir,
      sessionId: 'sess_sec',
      runId: 'run_sec',
    });

    const googleKey = 'AIzaSyA12345678901234567890123456789';
    const bearer = 'Bearer super_secret_access_token_1234567';

    tracer.emit('prompt', {
      systemPrompt: `Use key ${googleKey} and ${bearer}`,
    });
    tracer.emit('tool_call', {
      name: 'auth',
      args: { token: bearer },
    });

    const rawContent = fs.readFileSync(tracer.filePath, 'utf-8');
    expect(rawContent).not.toContain(googleKey);
    expect(rawContent).not.toContain(bearer);
    expect(rawContent).toContain('[REDACTED_SECRET]');

    const events = await Tracer.readTrace(tracer.filePath);
    expect(events).toHaveLength(2);
  });

  it('integrates with AgentLoop and logs events across steps', async () => {
    const tracer = new Tracer({
      traceDir: tmpDir,
      sessionId: 'sess_loop',
      runId: 'run_loop',
    });

    let turn = 0;
    const fakeAdapter: ModelAdapter = {
      id: 'mock:model',
      caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 4096 },
      async *chat(_req: ChatRequest): AsyncIterable<ChatChunk> {
        turn++;
        if (turn === 1) {
          yield {
            delta: 'calling echo',
            toolCalls: [{ id: 'tc1', name: 'echo', args: { message: 'hello trace' } }],
          };
        } else {
          yield { delta: 'done' };
        }
      },
      countTokens: () => 20,
    };

    const loop = new AgentLoop({
      adapter: fakeAdapter,
      tracer,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of loop.run([{ role: 'user', content: 'run tool' }])) {
      // consume stream
    }

    const events = await Tracer.readTrace(tracer.filePath);
    const types = events.map((e) => e.type);

    expect(types).toContain('session_start');
    expect(types).toContain('prompt');
    expect(types).toContain('model_call');
    expect(types).toContain('tool_call');
    expect(types).toContain('tool_result');
    expect(types).toContain('session_end');
  });

  it('logs error event on loop exception', async () => {
    const tracer = new Tracer({
      traceDir: tmpDir,
      sessionId: 'sess_err',
      runId: 'run_err',
    });

    const failingAdapter: ModelAdapter = {
      id: 'mock:failing',
      caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 4096 },
      // eslint-disable-next-line require-yield
      async *chat(): AsyncIterable<ChatChunk> {
        throw new Error('Connection reset by peer');
      },
      countTokens: () => 10,
    };

    const loop = new AgentLoop({
      adapter: failingAdapter,
      tracer,
    });

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of loop.run([{ role: 'user', content: 'test error' }])) {
        // iterate
      }
    }).rejects.toThrow('Connection reset by peer');

    const events = await Tracer.readTrace(tracer.filePath);
    const errEvent = events.find((e) => e.type === 'error');
    expect(errEvent).toBeDefined();
    expect(errEvent?.data['error']).toContain('Connection reset by peer');
  });

  it('locates trace file, computes stats, and renders replay lines', async () => {
    const tracer = new Tracer({
      traceDir: tmpDir,
      sessionId: 'sess_replay',
      runId: 'run_sample123',
    });

    tracer.emit('session_start', { model: 'llama3.1:8b', role: 'assistant' });
    tracer.emit('model_call', { modelId: 'ollama:llama3.1:8b', messagesCount: 3 });
    tracer.emit('tool_call', { step: 1, callId: 'c1', name: 'fs_grep', args: { pattern: 'TODO' } });
    tracer.emit('tool_result', { step: 1, callId: 'c1', name: 'fs_grep', content: 'found 5 items', isError: false });
    tracer.emit('error', { step: 2, error: 'Simulated warning' });
    tracer.emit('session_end', { step: 2, totalTokens: 1500, durationMs: 450 });

    // 1. findTraceFile
    const found = Tracer.findTraceFile('run_sample123', tmpDir);
    expect(found).toBe(tracer.filePath);

    // 2. computeStats
    const events = await Tracer.readTrace(tracer.filePath);
    const stats = Tracer.computeStats(events);

    expect(stats.runId).toBe('run_sample123');
    expect(stats.steps).toBe(2);
    expect(stats.totalTokens).toBe(1500);
    expect(stats.modelsUsed).toContain('ollama:llama3.1:8b');
    expect(stats.toolCallsCount).toBe(1);
    expect(stats.toolsUsed['fs_grep']).toBe(1);
    expect(stats.errorsCount).toBe(1);
    expect(stats.eventsCount).toBe(6);

    // 3. renderReplay
    const replayLines = Tracer.renderReplay(events);
    expect(replayLines.length).toBeGreaterThanOrEqual(6);
    expect(replayLines[0]).toContain('TRACE REPLAY: run_sample123');
    expect(replayLines.some((l) => l.includes('Tool Call: fs_grep'))).toBe(true);
    expect(replayLines.some((l) => l.includes('Tool Result: fs_grep'))).toBe(true);
  });
});
