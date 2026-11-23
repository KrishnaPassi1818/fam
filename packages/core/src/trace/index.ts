import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { redactSecrets } from '@fam/shared';

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

export interface TraceStats {
  runId: string;
  durationMs: number;
  totalTokens: number;
  steps: number;
  modelsUsed: string[];
  toolCallsCount: number;
  toolsUsed: Record<string, number>;
  errorsCount: number;
  eventsCount: number;
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
      process.env['FAM_TRACES_DIR'] ||
      process.env['HX_TRACES_DIR'] ||
      path.join(os.homedir(), '.fam', 'traces');

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

  public static findTraceFile(target: string, baseDir?: string): string | null {
    if (fs.existsSync(target) && fs.statSync(target).isFile()) {
      return target;
    }
    const root =
      baseDir ||
      process.env['FAM_TRACES_DIR'] ||
      process.env['HX_TRACES_DIR'] ||
      path.join(os.homedir(), '.fam', 'traces');

    if (!fs.existsSync(root)) return null;

    const walk = (dir: string): string | null => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const res = walk(full);
          if (res) return res;
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          if (entry.name === `${target}.jsonl` || entry.name.includes(target) || full.includes(target)) {
            return full;
          }
        }
      }
      return null;
    };

    return walk(root);
  }

  public static computeStats(events: TraceEvent[]): TraceStats {
    let totalTokens = 0;
    let errorsCount = 0;
    let toolCallsCount = 0;
    let maxStep = 0;
    const models = new Set<string>();
    const toolsUsed: Record<string, number> = {};

    let startMs = 0;
    let endMs = 0;

    for (const ev of events) {
      const ts = new Date(ev.timestamp).getTime();
      if (!startMs || ts < startMs) startMs = ts;
      if (ts > endMs) endMs = ts;

      if (typeof ev.data['step'] === 'number') {
        maxStep = Math.max(maxStep, ev.data['step']);
      }
      if (typeof ev.data['totalTokens'] === 'number') {
        totalTokens = Math.max(totalTokens, ev.data['totalTokens']);
      }
      if (ev.type === 'model_call' && typeof ev.data['modelId'] === 'string') {
        models.add(ev.data['modelId']);
      }
      if (ev.type === 'tool_call' && typeof ev.data['name'] === 'string') {
        toolCallsCount++;
        const name = ev.data['name'];
        toolsUsed[name] = (toolsUsed[name] || 0) + 1;
      }
      if (ev.type === 'error') {
        errorsCount++;
      }
    }

    const runId = events[0]?.runId || 'unknown';
    const durationMs = endMs > startMs ? endMs - startMs : 0;

    return {
      runId,
      durationMs,
      totalTokens,
      steps: maxStep,
      modelsUsed: Array.from(models),
      toolCallsCount,
      toolsUsed,
      errorsCount,
      eventsCount: events.length,
    };
  }

  public static renderReplay(events: TraceEvent[]): string[] {
    const lines: string[] = [];
    lines.push(`=== TRACE REPLAY: ${events[0]?.runId || 'unknown'} (Session: ${events[0]?.sessionId || 'unknown'}) ===`);

    for (const ev of events) {
      const time = ev.timestamp.slice(11, 19);
      switch (ev.type) {
        case 'session_start':
          lines.push(`[${time}] 🚀 Session started (model=${ev.data['model']}, role=${ev.data['role']})`);
          break;
        case 'prompt':
          lines.push(
            `[${time}] 📝 Prompt step ${ev.data['step']} (${ev.data['tokenCount']} tokens, layers: ${(ev.data['layersIncluded'] as string[])?.join(', ')})`,
          );
          break;
        case 'model_call':
          lines.push(`[${time}] 🤖 Model call (${ev.data['modelId']}, messages=${ev.data['messagesCount']})`);
          break;
        case 'tool_call':
          lines.push(`[${time}] ⚙️  Tool Call: ${ev.data['name']} (id=${ev.data['callId']}) args=${JSON.stringify(ev.data['args'])}`);
          break;
        case 'tool_result':
          lines.push(
            `[${time}] 📥 Tool Result: ${ev.data['name']} (isError=${ev.data['isError']}) -> ${String(ev.data['content']).slice(0, 80)}`,
          );
          break;
        case 'permission':
          lines.push(`[${time}] 🛡️  Permission check: ${ev.data['tool']} -> ${ev.data['granted'] ? 'GRANTED' : 'DENIED'}`);
          break;
        case 'route':
          lines.push(`[${time}] 🔀 Route: intent=${ev.data['intent']} -> target=${ev.data['target']}`);
          break;
        case 'escalate':
          lines.push(`[${time}] ⬆️  Escalate: ${ev.data['from']} -> ${ev.data['to']} (reason: ${ev.data['reason']})`);
          break;
        case 'error':
          lines.push(`[${time}] ❌ Error: ${ev.data['error']}`);
          break;
        case 'session_end':
          lines.push(`[${time}] 🏁 Session completed in ${ev.data['durationMs']}ms, tokens=${ev.data['totalTokens']}`);
          break;
        default:
          lines.push(`[${time}] [${ev.type}] ${JSON.stringify(ev.data)}`);
      }
    }
    return lines;
  }
}
