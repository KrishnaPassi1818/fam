import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { resolvePath } from '../config/index.js';
import type { MemoryItem } from './types.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

export interface MemoryDatabaseOptions {
  dbPath?: string;
  inMemory?: boolean;
}

export class MemoryDatabase {
  private db: DatabaseSyncType;
  private hasSqliteVec = false;
  private readonly dbPath?: string;

  constructor(options: MemoryDatabaseOptions = {}) {
    if (options.inMemory) {
      this.db = new DatabaseSync(':memory:', { allowExtension: true });
    } else {
      const rawPath = options.dbPath || resolvePath('~/.harness/db/memory.sqlite');
      this.dbPath = resolvePath(rawPath);
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.db = new DatabaseSync(this.dbPath, { allowExtension: true });
    }

    this.initSqliteVec();
    this.runMigrations();
  }

  private initSqliteVec(): void {
    try {
      // Try to load sqlite-vec dynamically
      const sqliteVec = require('sqlite-vec');
      if (typeof sqliteVec?.getLoadablePath === 'function') {
        const loadablePath = sqliteVec.getLoadablePath();
        this.db.loadExtension(loadablePath);
        this.hasSqliteVec = true;
      }
    } catch {
      // sqlite-vec not available or failed to load; using pure JS fallback
      this.hasSqliteVec = false;
    }
  }

  public isUsingVecExtension(): boolean {
    return this.hasSqliteVec;
  }

  private runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS memory (
        id TEXT PRIMARY KEY,
        kind TEXT CHECK(kind IN ('semantic','episodic')),
        text TEXT NOT NULL,
        tags TEXT,
        scope TEXT,
        importance REAL DEFAULT 0.5,
        privacy TEXT DEFAULT 'normal',
        source TEXT,
        created_at INTEGER,
        last_used_at INTEGER,
        use_count INTEGER DEFAULT 0,
        superseded_by TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project TEXT,
        started_at INTEGER,
        summary TEXT,
        model_stats TEXT
      );
    `);

    // Vector table: vec0 if sqlite-vec is active, else blob fallback table
    if (this.hasSqliteVec) {
      try {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(
            id TEXT PRIMARY KEY,
            embedding FLOAT[768]
          );
        `);
      } catch {
        this.hasSqliteVec = false;
      }
    }

    if (!this.hasSqliteVec) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memory_embeddings (
          id TEXT PRIMARY KEY,
          embedding BLOB
        );
      `);
    }
  }

  public insertMemory(item: MemoryItem, embedding?: number[]): void {
    const insertStmt = this.db.prepare(`
      INSERT INTO memory (
        id, kind, text, tags, scope, importance, privacy, source,
        created_at, last_used_at, use_count, superseded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      item.id,
      item.kind,
      item.text,
      JSON.stringify(item.tags || []),
      item.scope,
      item.importance ?? 0.5,
      item.privacy ?? 'normal',
      item.source ?? 'user',
      item.createdAt,
      item.lastUsedAt,
      item.useCount ?? 0,
      item.supersededBy ?? null
    );

    if (embedding && embedding.length > 0) {
      this.saveEmbedding(item.id, embedding);
    }
  }

  public saveEmbedding(id: string, embedding: number[]): void {
    if (this.hasSqliteVec) {
      try {
        const vecStmt = this.db.prepare(`
          INSERT OR REPLACE INTO memory_vec(id, embedding) VALUES (?, ?)
        `);
        // sqlite-vec expects Float32Array buffer or JSON
        vecStmt.run(id, JSON.stringify(embedding));
        return;
      } catch {
        // Fallback to blob if vec0 fails
      }
    }

    // Fallback BLOB table
    const blobStmt = this.db.prepare(`
      INSERT OR REPLACE INTO memory_embeddings (id, embedding) VALUES (?, ?)
    `);
    const floatArr = new Float32Array(embedding);
    const buf = Buffer.from(floatArr.buffer, floatArr.byteOffset, floatArr.byteLength);
    blobStmt.run(id, buf);
  }

  public getEmbedding(id: string): number[] | undefined {
    try {
      if (this.hasSqliteVec) {
        const row = this.db.prepare(`SELECT embedding FROM memory_vec WHERE id = ?`).get(id) as
          | { embedding: Buffer }
          | undefined;
        if (row && row.embedding) {
          const f32 = new Float32Array(
            row.embedding.buffer,
            row.embedding.byteOffset,
            row.embedding.byteLength / 4
          );
          return Array.from(f32);
        }
      }

      const row = this.db.prepare(`SELECT embedding FROM memory_embeddings WHERE id = ?`).get(id) as
        | { embedding: Buffer }
        | undefined;
      if (!row || !row.embedding) return undefined;
      const f32 = new Float32Array(
        row.embedding.buffer,
        row.embedding.byteOffset,
        row.embedding.byteLength / 4
      );
      return Array.from(f32);
    } catch {
      return undefined;
    }
  }

  public getMemory(id: string): MemoryItem | undefined {
    const row = this.db.prepare(`SELECT * FROM memory WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  public getAllActiveMemories(scopes?: string[]): MemoryItem[] {
    let query = `SELECT * FROM memory WHERE superseded_by IS NULL`;
    const params: string[] = [];

    if (scopes && scopes.length > 0) {
      const placeholders = scopes.map(() => '?').join(',');
      query += ` AND scope IN (${placeholders})`;
      params.push(...scopes);
    }

    const stmt = this.db.prepare(query);
    const rows = (stmt.all as (...args: unknown[]) => Record<string, unknown>[])(...params);
    return rows.map((r) => this.mapRow(r));
  }

  public getAllMemories(): MemoryItem[] {
    const rows = this.db.prepare(`SELECT * FROM memory ORDER BY created_at DESC`).all() as Record<string, unknown>[];
    return rows.map((r) => this.mapRow(r));
  }

  public markSuperseded(oldId: string, newId: string): void {
    this.db.prepare(`UPDATE memory SET superseded_by = ? WHERE id = ?`).run(newId, oldId);
  }

  public bumpUseCount(id: string): void {
    const now = Date.now();
    this.db.prepare(`UPDATE memory SET use_count = use_count + 1, last_used_at = ? WHERE id = ?`).run(now, id);
  }

  public deleteMemory(id: string): boolean {
    const res = this.db.prepare(`DELETE FROM memory WHERE id = ?`).run(id);
    if (this.hasSqliteVec) {
      try {
        this.db.prepare(`DELETE FROM memory_vec WHERE id = ?`).run(id);
      } catch {
        // ignore
      }
    } else {
      this.db.prepare(`DELETE FROM memory_embeddings WHERE id = ?`).run(id);
    }
    return (res.changes as number) > 0;
  }

  public wipeAll(): void {
    this.db.exec(`
      DELETE FROM memory;
      DELETE FROM sessions;
    `);
    if (this.hasSqliteVec) {
      try {
        this.db.exec(`DELETE FROM memory_vec;`);
      } catch {
        // ignore
      }
    } else {
      this.db.exec(`DELETE FROM memory_embeddings;`);
    }
  }

  private mapRow(row: Record<string, unknown>): MemoryItem {
    let tags: string[] = [];
    try {
      tags = JSON.parse(String(row['tags'] || '[]')) as string[];
    } catch {
      tags = [];
    }

    const item: MemoryItem = {
      id: String(row['id']),
      kind: row['kind'] as MemoryItem['kind'],
      text: String(row['text']),
      tags,
      scope: String(row['scope'] || 'global'),
      importance: Number(row['importance'] ?? 0.5),
      privacy: (row['privacy'] as MemoryItem['privacy']) || 'normal',
      source: (row['source'] as MemoryItem['source']) || 'user',
      createdAt: Number(row['created_at']),
      lastUsedAt: Number(row['last_used_at']),
      useCount: Number(row['use_count'] ?? 0),
      supersededBy: row['superseded_by'] ? String(row['superseded_by']) : null,
    };

    const emb = this.getEmbedding(item.id);
    if (emb) {
      item.embedding = emb;
    }
    return item;
  }

  public close(): void {
    this.db.close();
  }
}
