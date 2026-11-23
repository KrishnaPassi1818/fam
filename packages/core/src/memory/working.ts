import fs from 'fs';
import path from 'path';
import { resolvePath } from '../config/index.js';
import type { Message } from '@fam/shared';
import type { TodoItem } from './types.js';

export interface SessionStateData {
  sessionId: string;
  projectPath: string;
  startedAt: number;
  updatedAt: number;
  todos: TodoItem[];
  scratch: Record<string, string>;
  summary?: string;
  messages: Message[];
}

export class TodoManager {
  private items: TodoItem[] = [];

  constructor(initialItems: TodoItem[] = []) {
    this.items = [...initialItems];
  }

  public add(text: string): TodoItem {
    const item: TodoItem = {
      id: `todo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: text.trim(),
      done: false,
      createdAt: Date.now(),
    };
    this.items.push(item);
    return item;
  }

  public done(idOrIndex: string | number): boolean {
    if (typeof idOrIndex === 'number') {
      const item = this.items[idOrIndex];
      if (item) {
        item.done = true;
        return true;
      }
      return false;
    }

    const item = this.items.find((t) => t.id === idOrIndex);
    if (item) {
      item.done = true;
      return true;
    }
    return false;
  }

  public list(): TodoItem[] {
    return [...this.items];
  }

  public clear(): void {
    this.items = [];
  }

  public formatForPrompt(): string {
    if (this.items.length === 0) return '';
    const lines = ['## Working TODO list'];
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]!;
      const mark = it.done ? '[x]' : '[ ]';
      lines.push(`${i + 1}. ${mark} ${it.text}`);
    }
    return lines.join('\n');
  }
}

export class Scratchpad {
  private data: Record<string, string> = {};
  private readonly maxBytes = 2048; // Bounded to 2 KB total per memory.md §6

  constructor(initialData: Record<string, string> = {}) {
    this.data = { ...initialData };
  }

  public set(key: string, value: string): void {
    const testCopy = { ...this.data, [key]: value };
    const bytes = Buffer.byteLength(JSON.stringify(testCopy), 'utf-8');
    if (bytes > this.maxBytes) {
      throw new Error(`Scratchpad capacity exceeded: maximum size is 2 KB (attempted ${bytes} bytes)`);
    }
    this.data[key] = value;
  }

  public get(key: string): string | undefined {
    return this.data[key];
  }

  public append(key: string, value: string): void {
    const prev = this.data[key] || '';
    this.set(key, prev ? `${prev}\n${value}` : value);
  }

  public getAll(): Record<string, string> {
    return { ...this.data };
  }

  public clear(): void {
    this.data = {};
  }
}

export class SessionPersistence {
  private readonly sessionsDir: string;

  constructor(sessionsDir?: string) {
    this.sessionsDir = sessionsDir || resolvePath('~/.fam/sessions');
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  public saveSession(state: SessionStateData): void {
    const filePath = path.join(this.sessionsDir, `${state.sessionId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  public loadSession(sessionId: string): SessionStateData | null {
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as SessionStateData;
    } catch {
      return null;
    }
  }

  public listSessions(): Array<{ sessionId: string; startedAt: number; summary?: string }> {
    if (!fs.existsSync(this.sessionsDir)) return [];
    const files = fs.readdirSync(this.sessionsDir).filter((f) => f.endsWith('.json'));
    const results: Array<{ sessionId: string; startedAt: number; summary?: string }> = [];

    for (const f of files) {
      try {
        const data = fs.readFileSync(path.join(this.sessionsDir, f), 'utf-8');
        const state = JSON.parse(data) as SessionStateData;
        results.push({
          sessionId: state.sessionId,
          startedAt: state.startedAt,
          summary: state.summary,
        });
      } catch {
        // ignore invalid file
      }
    }

    return results.sort((a, b) => b.startedAt - a.startedAt);
  }

  public getLatestSession(): SessionStateData | null {
    const list = this.listSessions();
    if (list.length === 0) return null;
    return this.loadSession(list[0]!.sessionId);
  }

  public historySearch(query: string): Array<{ sessionId: string; matchText: string }> {
    const list = this.listSessions();
    const queryLower = query.toLowerCase();
    const results: Array<{ sessionId: string; matchText: string }> = [];

    for (const item of list) {
      const session = this.loadSession(item.sessionId);
      if (!session) continue;

      for (const msg of session.messages) {
        if (typeof msg.content === 'string' && msg.content.toLowerCase().includes(queryLower)) {
          results.push({
            sessionId: session.sessionId,
            matchText: msg.content.slice(0, 150),
          });
          break;
        }
      }
    }

    return results;
  }
}
