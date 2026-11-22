export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z_-]{30,40}/g, // Google API key
  /sk-[a-zA-Z0-9]{32,64}/g,    // OpenAI key
  /ghp_[0-9a-zA-Z]{36}/g,     // GitHub token
  /bearer\s+[a-zA-Z0-9_.-]{20,}/gi, // Bearer token
];

export function redactSecrets(text: string): string {
  let redacted = text;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED_SECRET]');
  }
  return redacted;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

export class Logger {
  private level: LogLevel = 'info';

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_WEIGHTS[level] >= LEVEL_WEIGHTS[this.level];
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const safeMessage = redactSecrets(message);
    const entry: LogEntry = {
      level,
      message: safeMessage,
      timestamp: new Date().toISOString(),
      ...(context ? { context: JSON.parse(redactSecrets(JSON.stringify(context))) as Record<string, unknown> } : {}),
    };

    const out = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${
      context ? ` ${JSON.stringify(entry.context)}` : ''
    }`;

    if (level === 'error') {
      process.stderr.write(out + '\n');
    } else {
      process.stdout.write(out + '\n');
    }
  }

  debug(msg: string, context?: Record<string, unknown>): void {
    this.log('debug', msg, context);
  }

  info(msg: string, context?: Record<string, unknown>): void {
    this.log('info', msg, context);
  }

  warn(msg: string, context?: Record<string, unknown>): void {
    this.log('warn', msg, context);
  }

  error(msg: string, context?: Record<string, unknown>): void {
    this.log('error', msg, context);
  }
}

export const logger = new Logger('info');
