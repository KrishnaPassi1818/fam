import { describe, it, expect } from 'vitest';
import { AgentLoop } from '../loop/index.js';
import { TaskPlanner } from '../loop/planner.js';
import { ToolRegistry } from '../tools/registry.js';
import type { ModelAdapter, ChatRequest, ChatChunk, ToolResult } from '@fam/shared';

describe('Phase 1: Agent Execution Lifecycle & Grounding Enforcement', () => {
  it('generates a structured execution plan for complex multi-step tasks', () => {
    const prompt = 'Create a Python script hello.py, execute it, and save the output to result.txt';
    const isComplex = TaskPlanner.isComplexTask(prompt);
    expect(isComplex).toBe(true);

    const plan = TaskPlanner.generatePlan('task-123', prompt);
    expect(plan.task_id).toBe('task-123');
    expect(plan.steps.length).toBeGreaterThanOrEqual(4);
    expect(plan.steps[0]?.description).toBeDefined();
    expect(plan.is_complex).toBe(true);
  });

  it('does not generate elaborate plan for simple read requests', () => {
    const prompt = 'read file README.md';
    const isComplex = TaskPlanner.isComplexTask(prompt);
    expect(isComplex).toBe(false);
  });

  it('rejects unverified completion claims when tools were required (grounding enforcement)', async () => {
    let callCount = 0;
    const fakeAdapter: ModelAdapter = {
      id: 'mock:small-model',
      caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 4096 },
      async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
        callCount++;
        if (callCount === 1) {
          // Model hallucinates it ran the script without calling tools
          yield { delta: 'I have created hello.py and executed it successfully. Output is Hello World!' };
        } else if (callCount === 2) {
          // In turn 2, after the grounding verification notice, the model actually calls the tool
          const userNotice = req.messages.find((m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('Grounding Notice'));
          expect(userNotice).toBeDefined();
          yield {
            delta: 'Executing script now...',
            toolCalls: [{ id: 'call_echo', name: 'echo', args: { message: 'Hello World' } }],
          };
        } else {
          // In turn 3, tool result is in messages, model finishes
          yield { delta: 'Script execution finished with verified output.' };
        }
      },
      countTokens: () => 20,
    };

    const loop = new AgentLoop({ adapter: fakeAdapter });
    const events: Array<{ type: string; [key: string]: unknown }> = [];

    for await (const ev of loop.run([{ role: 'user', content: 'Create a Python script and run it' }])) {
      events.push(ev);
    }

    // Should have transitioned to REPLANNING because turn 1 lacked tool execution evidence
    const replanEv = events.find((e) => e.type === 'state_change' && e['state'] === 'REPLANNING');
    expect(replanEv).toBeDefined();

    // Succeeded eventually after real tool call
    const finishEv = events.find((e) => e.type === 'finish');
    expect(finishEv).toBeDefined();
  });

  it('attaches normalized execution record conforming to contract on every tool execution', async () => {
    const fakeAdapter: ModelAdapter = {
      id: 'mock:model',
      caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 4096 },
      async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
        if (!req.messages.some((m) => m.role === 'tool')) {
          yield {
            delta: 'Calling math...',
            toolCalls: [{ id: 'exec-test-1', name: 'math', args: { expression: '40 + 2' } }],
          };
        } else {
          yield { delta: 'Math verified: 42' };
        }
      },
      countTokens: () => 10,
    };

    const loop = new AgentLoop({ adapter: fakeAdapter });
    const results: ToolResult[] = [];

    for await (const ev of loop.run([{ role: 'user', content: 'Calculate 40 + 2' }])) {
      if (ev.type === 'tool_result') {
        results.push(ev.toolResult);
      }
    }

    expect(results).toHaveLength(1);
    const res = results[0]!;
    expect(res.callId).toBe('exec-test-1');
    expect(res.normalized).toBeDefined();

    const norm = res.normalized as Record<string, unknown>;
    expect(norm['execution_id']).toBe('exec-test-1');
    expect(norm['task_id']).toMatch(/^task_/);
    expect(norm['tool']).toBe('math');
    expect(norm['status']).toBe('succeeded');
    expect(norm['verified']).toBe(true);
    expect(norm['duration_ms']).toBeGreaterThanOrEqual(0);
  });

  it('registers tools in centralized ToolRegistry declaring permissions and metadata', () => {
    const registry = new ToolRegistry();
    registry.register(
      {
        name: 'fs_write_file',
        description: 'Writes file to disk',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
        permissionCategory: 'filesystem',
        riskCategory: 'medium',
        tier: 1,
        timeoutMs: 15000,
        idempotent: false,
        changesExternalState: true,
        approvalRequired: false,
      },
      'write_file',
    );

    expect(registry.has('fs_write_file')).toBe(true);
    expect(registry.has('write_file')).toBe(true);

    const entry = registry.get('write_file');
    expect(entry?.tier).toBe(1);
    expect(entry?.changesExternalState).toBe(true);

    const descriptors = registry.getDescriptors();
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]?.annotations?.readOnlyHint).toBe(false);
  });
});
