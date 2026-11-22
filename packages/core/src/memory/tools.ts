import type { ToolDescriptor } from '@hx/shared';
import type { MemoryService } from './service.js';
import type { TodoManager, Scratchpad, SessionPersistence } from './working.js';

export const REMEMBER_DESCRIPTOR: ToolDescriptor = {
  name: 'core.remember',
  alias: 'remember',
  description: 'Store an important fact, user preference, or project convention into long-term permanent memory.',
  shortDescription: 'Store long-term memory.',
  category: 'core',
  tier: 0,
  timeoutMs: 5000,
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The fact or preference to remember permanently' },
      kind: { type: 'string', enum: ['semantic', 'episodic'], description: 'semantic (facts/preferences) or episodic (task outcome)' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional classification tags' },
      scope: { type: 'string', enum: ['global', 'project'], description: 'Scope: global (all projects) or project (current repository)' },
    },
    required: ['text'],
  },
  annotations: { readOnlyHint: false, idempotentHint: true },
};

export const TODO_DESCRIPTOR: ToolDescriptor = {
  name: 'core.todo',
  alias: 'todo',
  description: 'Manage the current working task checklist (add, done, list, clear). Re-injected each turn to maintain focus.',
  shortDescription: 'Manage working todo items.',
  category: 'core',
  tier: 0,
  timeoutMs: 3000,
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['add', 'done', 'list', 'clear'], description: 'Action to perform' },
      text: { type: 'string', description: 'Task description for "add"' },
      id: { type: 'string', description: 'Task ID or index to mark "done"' },
    },
    required: ['action'],
  },
  annotations: { readOnlyHint: false },
};

export const SCRATCH_DESCRIPTOR: ToolDescriptor = {
  name: 'core.scratch',
  alias: 'scratch',
  description: 'Manage session scratchpad key-value notes (set, get, append). Bounded to 2 KB total.',
  shortDescription: 'Session key-value scratchpad.',
  category: 'core',
  tier: 0,
  timeoutMs: 3000,
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['set', 'get', 'append'], description: 'Action to perform' },
      key: { type: 'string', description: 'Note key name' },
      value: { type: 'string', description: 'Note content value' },
    },
    required: ['action', 'key'],
  },
  annotations: { readOnlyHint: false },
};

export const HISTORY_SEARCH_DESCRIPTOR: ToolDescriptor = {
  name: 'core.history_search',
  alias: 'history_search',
  description: 'Search previous conversation transcripts and sessions on disk for past details and discussions.',
  shortDescription: 'Search past session transcripts.',
  category: 'core',
  tier: 0,
  timeoutMs: 5000,
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keywords to search past sessions for' },
    },
    required: ['query'],
  },
  annotations: { readOnlyHint: true },
};

export async function handleRemember(
  memoryService: MemoryService,
  args: { text: string; kind?: 'semantic' | 'episodic'; tags?: string[]; scope?: 'global' | 'project' }
): Promise<string> {
  const res = await memoryService.remember(args);
  if (res.action === 'bumped') {
    return `Memory already exists (ID: ${res.id}). Bumped use count and recency timestamp.`;
  }
  if (res.action === 'superseded') {
    return `Updated existing memory with new information (New ID: ${res.id}). Previous version marked superseded.`;
  }
  return `Saved new memory (ID: ${res.id}): "${args.text}"`;
}

export function handleTodo(
  todoManager: TodoManager,
  args: { action: 'add' | 'done' | 'list' | 'clear'; text?: string; id?: string }
): string {
  switch (args.action) {
    case 'add': {
      if (!args.text) return 'Error: text is required for "add" action';
      const item = todoManager.add(args.text);
      return `Added task [${item.id}]: ${item.text}`;
    }
    case 'done': {
      if (!args.id) return 'Error: id is required for "done" action';
      const ok = todoManager.done(args.id);
      return ok ? `Marked task ${args.id} as completed [x].` : `Task ${args.id} not found.`;
    }
    case 'list': {
      const items = todoManager.list();
      if (items.length === 0) return 'Todo checklist is currently empty.';
      return items.map((it, idx) => `${idx + 1}. [${it.done ? 'x' : ' '}] ${it.text} (id: ${it.id})`).join('\n');
    }
    case 'clear': {
      todoManager.clear();
      return 'Cleared all todo items.';
    }
  }
}

export function handleScratch(
  scratchpad: Scratchpad,
  args: { action: 'set' | 'get' | 'append'; key: string; value?: string }
): string {
  switch (args.action) {
    case 'set': {
      if (args.value === undefined) return 'Error: value is required for "set" action';
      scratchpad.set(args.key, args.value);
      return `Set scratchpad key "${args.key}".`;
    }
    case 'get': {
      const val = scratchpad.get(args.key);
      return val !== undefined ? val : `Key "${args.key}" not found in scratchpad.`;
    }
    case 'append': {
      if (args.value === undefined) return 'Error: value is required for "append" action';
      scratchpad.append(args.key, args.value);
      return `Appended to scratchpad key "${args.key}".`;
    }
  }
}

export function handleHistorySearch(
  persistence: SessionPersistence,
  args: { query: string }
): string {
  const matches = persistence.historySearch(args.query);
  if (matches.length === 0) {
    return `No matching past conversations found for query "${args.query}".`;
  }
  const lines = [`Found ${matches.length} past conversation match(es):`];
  for (const m of matches) {
    lines.push(`- Session ${m.sessionId}: "${m.matchText}..."`);
  }
  return lines.join('\n');
}
