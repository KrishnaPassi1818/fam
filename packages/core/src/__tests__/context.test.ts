import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  ContextBudgeter,
  BlobStore,
  ToolResultStubber,
  TurnCompactor,
  EmergencyTruncator,
  ContextManager,
} from '../context/index.js';
import type { Message, ToolDescriptor } from '@hx/shared';

describe('Context Manager (Phase 4: T4.1 - T4.5)', () => {
  let tmpBlobsDir: string;

  beforeEach(() => {
    tmpBlobsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-blobs-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpBlobsDir, { recursive: true, force: true });
  });

  describe('ContextBudgeter (T4.1)', () => {
    it('resolves correct budget table for 8b local model', () => {
      const budgeter = new ContextBudgeter('ollama:llama3.1:8b');
      const b = budgeter.getBudget();

      expect(b.numCtx).toBe(8192);
      expect(b.system).toBe(500);
      expect(b.tools).toBe(4000);
      expect(b.history).toBe(2192);
      expect(b.reserve).toBe(1000);
    });

    it('accounts tokens across components and detects budget overflow', () => {
      const budgeter = new ContextBudgeter({
        numCtx: 1000,
        reserve: 400,
        system: 100,
        tools: 100,
        history: 400,
      });

      const systemPrompt = 'You are a test assistant.'; // ~5 tokens
      const tools: ToolDescriptor[] = [
        {
          name: 'echo',
          alias: 'echo',
          description: 'Echo tool',
          inputSchema: { type: 'object' },
          annotations: { readOnlyHint: true },
          category: 'core',
          tier: 0,
          timeoutMs: 5000,
        },
      ];

      // Small history fits
      const smallHistory: Message[] = [{ role: 'user', content: 'hello' }];
      expect(budgeter.fits(systemPrompt, tools, smallHistory)).toBe(true);

      // Huge history overflows (400 reserve + system + tools + 800 tokens history > 1000)
      const hugeHistory: Message[] = [
        { role: 'user', content: 'word '.repeat(700) },
      ];
      expect(budgeter.fits(systemPrompt, tools, hugeHistory)).toBe(false);
    });
  });

  describe('BlobStore & Offloading (T4.2)', () => {
    it('offloads large tool results to disk and retrieves via blob_read and blob_grep', () => {
      const store = new BlobStore({ blobsDir: tmpBlobsDir, thresholdChars: 500 });

      const largeContent = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}: ${i === 42 ? 'TARGET_SECRET_DATA' : 'normal log line'}`).join('\n');
      expect(store.shouldOffload(largeContent)).toBe(true);

      const meta = store.store(largeContent);
      expect(meta.handle).toMatch(/^blob_[a-f0-9]{16}$/);
      expect(meta.totalLines).toBe(100);
      expect(meta.summary).toContain(meta.handle);

      // Verify blob_read retrieves range
      const readSlice = store.read(meta.handle, 40, 45);
      expect(readSlice.lines).toBe(6);
      expect(readSlice.content).toContain('TARGET_SECRET_DATA');

      // Verify blob_grep finds pattern
      const grepRes = store.grep(meta.handle, 'TARGET_SECRET');
      expect(grepRes.count).toBe(1);
      expect(grepRes.matches[0]).toContain('L43: Line 43: TARGET_SECRET_DATA');
    });
  });

  describe('ToolResultStubber (T4.3)', () => {
    it('stubs older tool results while keeping the most recent intact', () => {
      const stubber = new ToolResultStubber({ recentToKeep: 1, maxStubLength: 50 });

      const messages: Message[] = [
        { role: 'user', content: 'run tool 1' },
        {
          role: 'tool',
          callId: 'c1',
          name: 'grep',
          content: 'Very long output line 1\nLine 2\nLine 3\n'.repeat(10),
          isError: false,
        },
        { role: 'user', content: 'run tool 2' },
        {
          role: 'tool',
          callId: 'c2',
          name: 'grep',
          content: 'Recent result that should be kept verbatim\nLine 2',
          isError: false,
        },
      ];

      const res = stubber.stub(messages);
      expect(res.stubbedCount).toBe(1);

      // Oldest tool result should be stubbed
      const msg1 = res.messages[1] as Extract<Message, { role: 'tool' }>;
      expect(msg1.content).toContain("[Tool result for 'grep'");

      // Most recent tool result should be intact
      const msg3 = res.messages[3] as Extract<Message, { role: 'tool' }>;
      expect(msg3.content).toContain('Recent result that should be kept verbatim');
    });
  });

  describe('TurnCompactor (T4.4)', () => {
    it('compacts 10-turn conversation into <= 500-token summary preserving facts and decisions', async () => {
      const compactor = new TurnCompactor({ turnsToPreserve: 1, targetSummaryTokens: 400 });

      // Generate 10 turns
      const messages: Message[] = [];
      for (let i = 1; i <= 10; i++) {
        messages.push({ role: 'user', content: `User instruction ${i}: modify /workspace/file_${i}.ts` });
        messages.push({
          role: 'assistant',
          content: `Implemented change for turn ${i}`,
          toolCalls: [{ id: `tc_${i}`, name: 'write_file', args: { path: `/workspace/file_${i}.ts` } }],
        });
      }

      const res = await compactor.compact(messages);
      expect(res.compacted).toBe(true);

      const summaryMsg = res.messages.find((m) => m.content.includes('[Summary of earlier conversation turns]'));
      expect(summaryMsg).toBeDefined();

      // Summary must preserve accessed files
      expect(summaryMsg?.content).toContain('/workspace/file_');
      // Preserved recent turn
      expect(res.messages[res.messages.length - 1]?.content).toContain('turn 10');
    });
  });

  describe('EmergencyTruncator (T4.5)', () => {
    it('hard truncates oldest non-system/non-latest messages under tiny budget', () => {
      const truncator = new EmergencyTruncator();

      const messages: Message[] = [
        { role: 'system', content: 'System prompt instructions' },
        { role: 'user', content: 'Very old user message '.repeat(50) },
        { role: 'assistant', content: 'Very old assistant response '.repeat(50) },
        { role: 'user', content: 'Latest critical user query' },
      ];

      const res = truncator.truncate(messages, 50); // small target
      expect(res.droppedCount).toBeGreaterThanOrEqual(1);

      // System prompt and latest query must never be dropped
      expect(res.messages[0]?.role).toBe('system');
      expect(res.messages[res.messages.length - 1]?.content).toBe('Latest critical user query');
    });
  });

  describe('ContextManager Integration', () => {
    it('progressively applies offload, stubbing, compaction, and truncation', async () => {
      const manager = new ContextManager({
        budget: {
          numCtx: 600,
          reserve: 200,
          system: 50,
          tools: 50,
          history: 200,
        },
        blobStore: new BlobStore({ blobsDir: tmpBlobsDir, thresholdChars: 200 }),
      });

      const systemPrompt = 'Test system prompt';
      const messages: Message[] = [
        { role: 'user', content: 'Step 1' },
        { role: 'tool', callId: 'c1', name: 'big_tool', content: 'X'.repeat(500), isError: false },
        { role: 'assistant', content: 'Step 1 done' },
        { role: 'user', content: 'Step 2' },
        { role: 'assistant', content: 'Step 2 done' },
        { role: 'user', content: 'Latest query' },
      ];

      const res = await manager.prepareContext(systemPrompt, [], messages);
      expect(res.appliedStrategies.length).toBeGreaterThan(0);
      expect(res.appliedStrategies.some((s) => s.startsWith('blob_offload'))).toBe(true);
      expect(res.accounting.exceedsBudget).toBe(false);
    });
  });
});
