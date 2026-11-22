import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { redactSecrets } from '@hx/shared';

export type TraceEventType =
  | 'session_start'
  | 'session_end'
  | 'prompt'
  | 'model_call'
  | 'model_chunk'
  | 'tool_call'
  | 'tool_result'
  | 'permission'
  | 'route'
  | 'escalate'
  | 'compact'
  | 'error'
  | 'loop_warning';

export interface TraceEvent {
  id: string;
  timestamp: string;
  sessionId: string;
  runId: string;
  type: TraceEventType;
  data: Record<string, unknown>;
}

export interface TracerOptions {
  sessionId?: string;
  runId?: string;
  traceDir?: string;
  recordChunks?: boolean;
}

export class Tracer {
  public readonly sessionId: string;
  public readonly runId: string;
  public readonly traceDir: string;
  public readonly filePath: string;
  public readonly recordChunks: boolean;

  private seq = 0;

  constructor(options: TracerOptions = {}) {
    this.sessionId = options.sessionId || `session_${Date.now()}`;
    this.runId = options.runId || `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.recordChunks = options.recordChunks ?? false;

    const baseDir =
      options.traceDir ||
      process.env['HX_TRACES_DIR'] ||
      path.join(os.homedir(), '.harness', 'traces');

    this.traceDir = path.join(baseDir, this.sessionId);
    this.filePath = path.join(this.traceDir, `${this.runId}.jsonl`);

    fs.mkdirSync(this.traceDir, { recursive: true });
  }

  public emit(type: TraceEventType, data: Record<string, unknown> = {}): TraceEvent {
    this.seq++;
    const event: TraceEvent = {
      id: `${this.runId}_${this.seq}`,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      runId: this.runId,
      type,
      data,
    };

    // Serialize and redact all secrets before persisting to disk
    const rawJson = JSON.stringify(event);
    const sanitizedJson = redactSecrets(rawJson);

    fs.appendFileSync(this.filePath, sanitizedJson + '\n', 'utf-8');
    return event;
  }

  public static async readTrace(filePath: string): Promise<TraceEvent[]> {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const events: TraceEvent[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as TraceEvent;
        events.push(parsed);
      } catch {
        // Skip corrupted or truncated lines
      }
    }

    return events;
  }
}
