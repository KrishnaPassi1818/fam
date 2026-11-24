import { describe, it, expect, vi } from 'vitest';
import { OllamaAdapter } from '../adapters/ollama.js';
import type { ChatRequest, Message } from '@fam/shared';

describe('OllamaAdapter', () => {
  it('instantiates with expected default caps and properties', () => {
    const adapter = new OllamaAdapter({ model: 'qwen3.5:4b', numCtx: 4096 });
    expect(adapter.id).toBe('ollama:qwen3.5:4b');
    expect(adapter.caps.tools).toBe(true);
    expect(adapter.caps.maxCtx).toBe(4096);
  });

  it('parses fallback JSON tool calls from text', () => {
    const adapter = new OllamaAdapter({ model: 'qwen2.5:1.5b', caps: { tools: false } });

    // Single JSON block
    const text1 = '```json\n{"name": "fs_read_file", "args": {"path": "src/main.ts"}}\n```';
    const calls1 = adapter.parseFallbackToolCalls(text1);
    expect(calls1).toHaveLength(1);
    expect(calls1[0]?.name).toBe('fs_read_file');
    expect(calls1[0]?.args).toEqual({ path: 'src/main.ts' });

    // Tool/arguments style
    const text2 = '{"tool": "calculate", "arguments": {"expr": "2+2"}}';
    const calls2 = adapter.parseFallbackToolCalls(text2);
    expect(calls2).toHaveLength(1);
    expect(calls2[0]?.name).toBe('calculate');
    expect(calls2[0]?.args).toEqual({ expr: '2+2' });

    // Array style
    const text3 = '[{"name": "tool_a", "args": {}}, {"name": "tool_b", "args": {}}]';
    const calls3 = adapter.parseFallbackToolCalls(text3);
    expect(calls3).toHaveLength(2);

    // Text with embedded code blocks inside JSON args
    const text4 = 'Here is the function call:\n{"name": "fs_write_file", "parameters": {"path": "README.md", "content": "```bash\\nnpm test\\n```"}}';
    const calls4 = adapter.parseFallbackToolCalls(text4);
    expect(calls4).toHaveLength(1);
    expect(calls4[0]?.name).toBe('fs_write_file');
    expect(calls4[0]?.args).toEqual({ path: 'README.md', content: '```bash\nnpm test\n```' });

    // Multi-block tool calls in separate markdown code fences
    const text5 = 'First file:\n```json\n{"name": "fs_write_file", "arguments": {"path": "app/main.py", "content": "x=1"}}\n```\nSecond file:\n```json\n{"name": "fs_write_file", "arguments": {"path": "app/db.py", "content": "y=2"}}\n```\nRun tests:\n```json\n{"name": "sandbox_run_command", "arguments": {"command": "pytest"}}\n```';
    const calls5 = adapter.parseFallbackToolCalls(text5);
    expect(calls5).toHaveLength(3);
    expect(calls5[0]?.name).toBe('fs_write_file');
    expect(calls5[1]?.name).toBe('fs_write_file');
    expect(calls5[2]?.name).toBe('sandbox_run_command');

    // Multi-block tool calls with extra stray closing braces (e.g. }}} in model output)
    const text6 = '{"name": "fs_write_file", "arguments": {"path": "a.py", "content": "print(1)"}}}\n{"name": "fs_write_file", "arguments": {"path": "b.py", "content": "print(2)"}}';
    const calls6 = adapter.parseFallbackToolCalls(text6);
    expect(calls6).toHaveLength(2);
    expect(calls6[0]?.name).toBe('fs_write_file');
    expect(calls6[1]?.name).toBe('fs_write_file');
  });

  it('streams chunks and usage from mocked Ollama stream', async () => {
    const adapter = new OllamaAdapter({ model: 'qwen3.5:4b' });

    const mockLines = [
      JSON.stringify({ message: { content: 'Hello ' }, done: false }),
      JSON.stringify({ message: { content: 'world!' }, done: false }),
      JSON.stringify({
        message: { content: '' },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 12,
        eval_count: 8,
      }),
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const line of mockLines) {
          controller.enqueue(new TextEncoder().encode(line + '\n'));
        }
        controller.close();
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(stream, { status: 200 }));

    const req: ChatRequest = {
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const chunks = [];
    for await (const chunk of adapter.chat(req)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.delta).toBe('Hello ');
    expect(chunks[1]?.delta).toBe('world!');
    expect(chunks[2]?.finishReason).toBe('stop');
    expect(chunks[2]?.usage?.totalTokens).toBe(20);
    vi.restoreAllMocks();
  });

  it('parses native tool calls and assigns synthetic IDs', async () => {
    const adapter = new OllamaAdapter({ model: 'qwen3.5:4b' });

    const mockLines = [
      JSON.stringify({
        message: {
          content: '',
          tool_calls: [
            {
              function: {
                name: 'fs_read_file',
                arguments: '{"path": "README.md"}',
              },
            },
          ],
        },
        done: true,
      }),
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const line of mockLines) {
          controller.enqueue(new TextEncoder().encode(line + '\n'));
        }
        controller.close();
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(stream, { status: 200 }));

    const chunks = [];
    for await (const chunk of adapter.chat({ messages: [{ role: 'user', content: 'read README' }] })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.toolCalls).toBeDefined();
    expect(chunks[0]?.toolCalls?.[0]?.name).toBe('fs_read_file');
    expect(chunks[0]?.toolCalls?.[0]?.args).toEqual({ path: 'README.md' });
    expect(chunks[0]?.toolCalls?.[0]?.id).toMatch(/^call_/);
    expect(chunks[0]?.finishReason).toBe('tool_calls');
    vi.restoreAllMocks();
  });

  it('throws ModelError on HTTP failure', async () => {
    const adapter = new OllamaAdapter({ model: 'qwen3.5:4b' });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('out of memory allocating KV cache', { status: 507 }),
    );

    const run = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of adapter.chat({ messages: [{ role: 'user', content: 'Hi' }] })) {
        // iterate
      }
    };

    await expect(run()).rejects.toThrow(/Ollama returned HTTP 507/);
    vi.restoreAllMocks();
  });

  // Real live test against local Ollama if FAM_LIVE=1 or service active
  it.runIf(process.env['FAM_LIVE'] === '1')('connects to real Ollama and streams response [@live]', async () => {
    const adapter = new OllamaAdapter({ model: 'qwen2.5:1.5b' });
    const msgs: Message[] = [{ role: 'user', content: 'Reply with the single word: "PONG"' }];

    let text = '';
    for await (const chunk of adapter.chat({ messages: msgs })) {
      text += chunk.delta;
    }

    expect(text.trim().toUpperCase()).toContain('PONG');
  }, 15000);
});
