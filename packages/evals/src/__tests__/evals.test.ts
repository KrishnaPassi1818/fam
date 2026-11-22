import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  loadAllTasks,
  EvalRunner,
  saveEvalReport,
  formatMarkdownReport,
  type TaskDefinition,
} from '../index.js';
import type { ModelAdapter, ChatChunk } from '@hx/shared';

describe('Eval Framework Scaffold (T3.8)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-evals-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads all 5 initial smoke tasks from tasks directory', () => {
    const tasks = loadAllTasks();
    expect(tasks.length).toBeGreaterThanOrEqual(5);

    const ids = tasks.map((t) => t.id);
    expect(ids).toContain('task_01_smoke_chat');
    expect(ids).toContain('task_02_smoke_tool_echo');
    expect(ids).toContain('task_03_smoke_tool_time');
    expect(ids).toContain('task_04_smoke_file_write');
    expect(ids).toContain('task_05_smoke_permission_denial');
  });

  it('runs mock conversational task and evaluates response checks', async () => {
    const mockAdapter: ModelAdapter = {
      id: 'mock:eval-model',
      caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 4096 },
      async *chat(): AsyncIterable<ChatChunk> {
        yield { delta: 'PONG' };
      },
      countTokens: () => 10,
    };

    const task: TaskDefinition = {
      id: 'test_pong',
      suite: 'smoke',
      description: 'Ping-pong test',
      prompt: 'Reply PONG',
      checks: [
        { type: 'response_contains', substring: 'PONG' },
        { type: 'no_errors' },
      ],
    };

    const runner = new EvalRunner();
    const result = await runner.runTask(task, mockAdapter);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.checkResults).toHaveLength(2);
    expect(result.checkResults[0]?.passed).toBe(true);
  });

  it('runs mock tool task and evaluates tool_called and file checks', async () => {
    let turn = 0;
    const mockAdapter: ModelAdapter = {
      id: 'mock:eval-tool-model',
      caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 4096 },
      async *chat(): AsyncIterable<ChatChunk> {
        turn++;
        if (turn === 1) {
          yield {
            delta: 'Writing file...',
            toolCalls: [
              {
                id: 'c_eval',
                name: 'write_file',
                args: { path: 'result.txt', content: 'test pass' },
              },
            ],
          };
        } else {
          yield { delta: 'File successfully created' };
        }
      },
      countTokens: () => 15,
    };

    const task: TaskDefinition = {
      id: 'test_file_write',
      suite: 'smoke',
      description: 'File write check',
      prompt: 'Write result.txt with test pass',
      checks: [
        { type: 'tool_called', tool: 'write_file' },
        { type: 'file_exists', path: 'result.txt' },
        { type: 'file_contains', path: 'result.txt', substring: 'test pass' },
        { type: 'response_contains', substring: 'successfully created' },
        { type: 'no_errors' },
      ],
    };

    const runner = new EvalRunner();
    const result = await runner.runTask(task, mockAdapter);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.toolsInvoked).toContain('write_file');
    expect(result.checkResults.every((c) => c.passed)).toBe(true);
  });

  it('generates markdown report and saves JSON scoreboard to disk', async () => {
    const runner = new EvalRunner();
    const mockAdapter: ModelAdapter = {
      id: 'mock:scoreboard',
      caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 4096 },
      async *chat(): AsyncIterable<ChatChunk> {
        yield { delta: 'PONG' };
      },
      countTokens: () => 5,
    };

    const tasks = loadAllTasks();
    const task = tasks.find((t) => t.id === 'task_01_smoke_chat')!;

    const report = await runner.runSuite([task], mockAdapter);
    expect(report.tasksTotal).toBe(1);
    expect(report.tasksPassed).toBe(1);
    expect(report.scorePercent).toBe(100);

    const md = formatMarkdownReport(report);
    expect(md).toContain('# Eval Scoreboard: SMOKE Suite');
    expect(md).toContain('task_01_smoke_chat');
    expect(md).toContain('1 / 1 (100%)');

    const saved = saveEvalReport(report, tmpDir);
    expect(fs.existsSync(saved.jsonPath)).toBe(true);
    expect(fs.existsSync(saved.mdPath)).toBe(true);
  });
});
