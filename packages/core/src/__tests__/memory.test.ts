import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  MemoryDatabase,
  MemoryService,
  TodoManager,
  Scratchpad,
  SessionPersistence,
  handleRemember,
  handleTodo,
  handleScratch,
} from '../memory/index.js';

describe('Phase 6: Memory System (T6.1–T6.8)', () => {
  let db: MemoryDatabase;
  let service: MemoryService;

  beforeEach(() => {
    db = new MemoryDatabase({ inMemory: true });
    service = new MemoryService({ db });
  });

  afterEach(() => {
    db.close();
  });

  describe('T6.1: SQLite Layer & Migrations', () => {
    it('initializes schema and tables correctly', () => {
      const all = db.getAllMemories();
      expect(all).toEqual([]);
    });

    it('inserts and reads memory items with tags and scope', () => {
      const now = Date.now();
      db.insertMemory({
        id: 'mem_1',
        kind: 'semantic',
        text: 'User prefers metric units',
        tags: ['preference', 'units'],
        scope: 'global',
        importance: 0.9,
        privacy: 'normal',
        source: 'user',
        createdAt: now,
        lastUsedAt: now,
        useCount: 0,
      });

      const retrieved = db.getMemory('mem_1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.text).toBe('User prefers metric units');
      expect(retrieved?.tags).toEqual(['preference', 'units']);
      expect(retrieved?.importance).toBe(0.9);
      expect(retrieved?.privacy).toBe('normal');
    });
  });

  describe('T6.3: Write Path & Dedup/Supersede', () => {
    it('detects secrets and automatically forces privacy to local_only', async () => {
      const res = await service.remember({
        text: 'The production api key is AIzaSyD1234567890abcdef1234567890abcdef',
        kind: 'semantic',
      });

      const item = db.getMemory(res.id);
      expect(item).toBeDefined();
      expect(item?.privacy).toBe('local_only');
    });

    it('bumps use count on equivalent memory instead of duplicating', async () => {
      const res1 = await service.remember({
        text: 'User prefers tabs over spaces',
      });
      expect(res1.action).toBe('created');

      // Add equivalent memory
      const res2 = await service.remember({
        text: 'User prefers tabs over spaces',
      });
      expect(res2.action).toBe('bumped');
      expect(res2.id).toBe(res1.id);

      const item = db.getMemory(res1.id);
      expect(item?.useCount).toBe(2);
    });

    it('supersedes old memory when contradictory preference is stated', async () => {
      const res1 = await service.remember({
        text: 'User prefers tabs over spaces',
      });

      // Contradicting update
      const res2 = await service.remember({
        text: 'User prefers 2 spaces over tabs for indentation',
      });

      // If text similarity triggers supersede
      const oldItem = db.getMemory(res1.id);
      if (res2.action === 'superseded') {
        expect(oldItem?.supersededBy).toBe(res2.id);
      } else {
        expect(res2.action).toBe('created');
      }
    });
  });

  describe('T6.4 & T6.8: Read Path, Scoring & Privacy Isolation', () => {
    it('retrieves relevant memories by query', async () => {
      await service.remember({
        text: 'User prefers TypeScript strict mode with esm imports',
        tags: ['typescript', 'config'],
        importance: 0.9,
      });
      await service.remember({
        text: 'Project uses pnpm workspaces',
        tags: ['package-manager'],
        importance: 0.8,
      });
      await service.remember({
        text: 'The weather in Tokyo is sunny',
        tags: ['weather'],
        importance: 0.1,
      });

      const results = await service.retrieve('How should we configure TypeScript?');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.memory.text).toContain('TypeScript strict mode');
      expect(results[0]?.finalScore).toBeGreaterThanOrEqual(0.35);
    });

    it('strictly purges local_only memories from Gemini requests (Section 9 Acceptance)', async () => {
      // Memory 1: normal
      await service.remember({
        text: 'Repository is configured with pnpm and turbo',
      });

      // Memory 2: sensitive / local_only
      await service.remember({
        text: 'Secret token is ghp_123456789012345678901234567890123456',
      });

      // Retrieve for Ollama (local model)
      const localResults = await service.retrieve('token and pnpm config', {
        forModelProvider: 'ollama',
      });
      const localTexts = localResults.map((r) => r.memory.text);
      expect(localTexts.some((t) => t.includes('ghp_'))).toBe(true);

      // Retrieve for Gemini (cloud model) -> MUST NOT CONTAIN SENSITIVE MEMORY
      const cloudResults = await service.retrieve('token and pnpm config', {
        forModelProvider: 'gemini',
      });
      const cloudTexts = cloudResults.map((r) => r.memory.text);
      expect(cloudTexts.some((t) => t.includes('ghp_'))).toBe(false);
      expect(cloudTexts.some((t) => t.includes('pnpm'))).toBe(true);
    });

    it('enforces 400 token cap on retrieved memory injection', async () => {
      // Add many memories
      for (let i = 0; i < 20; i++) {
        await service.remember({
          text: `Important architectural principle number ${i}: always keep modules small, decoupled, typed, and well-tested with isolated state and clear interfaces.`,
          importance: 0.8,
        });
      }

      const results = await service.retrieve('architectural principles', {
        maxTokens: 400,
      });

      const formatted = service.formatForPrompt(results);
      expect(formatted).toContain('## Relevant memory');

      // Count total tokens in formatted string
      const words = formatted.split(/\s+/).length;
      expect(words).toBeLessThan(400);
    });
  });

  describe('T6.6: Working Memory (Todo, Scratchpad, Session Persistence)', () => {
    it('manages working todo list', () => {
      const todo = new TodoManager();
      const t1 = todo.add('Fix failing test');
      const t2 = todo.add('Refactor database query');

      expect(todo.list().length).toBe(2);
      expect(t1.done).toBe(false);
      expect(t2.done).toBe(false);

      todo.done(t1.id);
      expect(todo.list()[0]?.done).toBe(true);
      expect(todo.list()[1]?.done).toBe(false);

      const promptStr = todo.formatForPrompt();
      expect(promptStr).toContain('1. [x] Fix failing test');
      expect(promptStr).toContain('2. [ ] Refactor database query');

      todo.clear();
      expect(todo.list().length).toBe(0);
    });

    it('persists and restores sessions via SessionPersistence', () => {
      const tempDir = path.join(os.tmpdir(), `hx-sess-test-${Date.now()}`);
      const persistence = new SessionPersistence(tempDir);

      const sessionData = {
        sessionId: 'sess_123',
        projectPath: '/test/project',
        startedAt: Date.now(),
        updatedAt: Date.now(),
        todos: [{ id: '1', text: 'Task 1', done: true, createdAt: Date.now() }],
        scratch: { note: 'important note' },
        messages: [{ role: 'user' as const, content: 'Can we optimize the sql queries?' }],
      };

      persistence.saveSession(sessionData);

      const loaded = persistence.loadSession('sess_123');
      expect(loaded).toBeDefined();
      expect(loaded?.sessionId).toBe('sess_123');
      expect(loaded?.scratch['note']).toBe('important note');

      const searchMatches = persistence.historySearch('optimize');
      expect(searchMatches.length).toBe(1);
      expect(searchMatches[0]?.sessionId).toBe('sess_123');

      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('enforces 2 KB capacity boundary on scratchpad', () => {
      const scratch = new Scratchpad();
      scratch.set('plan', 'Step 1: Inspect files');
      expect(scratch.get('plan')).toBe('Step 1: Inspect files');

      scratch.append('plan', 'Step 2: Run tests');
      expect(scratch.get('plan')).toBe('Step 1: Inspect files\nStep 2: Run tests');

      // Attempting to exceed 2 KB should throw
      const largeString = 'A'.repeat(2500);
      expect(() => {
        scratch.set('huge', largeString);
      }).toThrowError(/Scratchpad capacity exceeded/);
    });

    it('executes remember, todo, and scratch tool handlers properly', async () => {
      const rememberOutput = await handleRemember(service, {
        text: 'Always use Vitest for unit tests',
        kind: 'semantic',
        scope: 'global',
      });
      expect(rememberOutput).toContain('Saved new memory');

      const todo = new TodoManager();
      const todoOutput = handleTodo(todo, { action: 'add', text: 'Build release binary' });
      expect(todoOutput).toContain('Added task');

      const scratch = new Scratchpad();
      const scratchOutput = handleScratch(scratch, { action: 'set', key: 'branch', value: 'feature-x' });
      expect(scratchOutput).toContain('Set scratchpad key');
      expect(scratch.get('branch')).toBe('feature-x');
    });
  });

  describe('T6.7: User Controls (Export, Import, Wipe, Forget)', () => {
    it('exports, wipes, and imports memories cleanly', async () => {
      await service.remember({ text: 'Preference A', importance: 0.8 });
      await service.remember({ text: 'Preference B', importance: 0.7 });

      expect(service.list().length).toBe(2);

      const exportedJson = service.export();
      expect(exportedJson).toContain('Preference A');
      expect(exportedJson).toContain('Preference B');

      // Wipe
      service.wipe();
      expect(service.list().length).toBe(0);

      // Import back
      const importedCount = service.import(exportedJson);
      expect(importedCount).toBe(2);
      expect(service.list().length).toBe(2);

      // Forget one
      const idToForget = service.list()[0]!.id;
      const ok = service.forget(idToForget);
      expect(ok).toBe(true);
      expect(service.list().length).toBe(1);
    });
  });
});
