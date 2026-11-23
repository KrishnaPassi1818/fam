import path from 'path';
import { type PrivacyConfig, type Message, PrivacyBlocked } from '@fam/shared';

export interface SecretMatch {
  type: 'pattern' | 'entropy';
  pattern?: string;
  sample: string;
}

export interface PrivacyCheckResult {
  allowed: boolean;
  reason?: string;
  violations: SecretMatch[];
  tainted: boolean;
}

export function matchPathGlob(filePath: string, pattern: string): boolean {
  const norm = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const base = path.basename(norm);

  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLE_STAR___\//g, '(?:.*/)?')
    .replace(/\/___DOUBLE_STAR___/g, '(?:/.*)?')
    .replace(/___DOUBLE_STAR___/g, '.*');

  const re = new RegExp(`^${regexStr}$`, 'i');
  return re.test(norm) || re.test(base);
}

export class PrivacyGate {
  private readonly config: PrivacyConfig;
  private readonly compiledPatterns: RegExp[];
  private sessionTainted = false;
  private taintReason?: string;
  private allowedOverride = false;

  constructor(config?: Partial<PrivacyConfig>) {
    this.config = {
      localOnlyPaths: config?.localOnlyPaths || [
        '**/.env*',
        '**/secrets/**',
        '**/*.pem',
        '**/*.key',
        '**/.git/**',
      ],
      secretRegexes: config?.secretRegexes || [
        '(?:AIza[0-9A-Za-z\\-_]{30,40})', // Google API key
        '(?:sk-[a-zA-Z0-9]{20,60})',       // Secret key
        '(?:ghp_[0-9a-zA-Z]{36})',          // GitHub PAT
        '(?:[a-zA-Z0-9_-]*:[a-zA-Z0-9_-]+@[a-zA-Z0-9.-]+)', // Basic auth
      ],
      failClosed: config?.failClosed ?? true,
    };

    this.compiledPatterns = this.config.secretRegexes.map((p: string) => new RegExp(p, 'i'));
  }

  public setOverride(override: boolean): void {
    this.allowedOverride = override;
  }

  public taint(reason: string): void {
    this.sessionTainted = true;
    this.taintReason = reason;
  }

  public isTainted(): boolean {
    return this.sessionTainted;
  }

  public getTaintReason(): string | undefined {
    return this.taintReason;
  }

  public isLocalOnlyPath(filePath: string): boolean {
    for (const pattern of this.config.localOnlyPaths) {
      if (matchPathGlob(filePath, pattern)) {
        return true;
      }
    }
    return false;
  }

  public calculateEntropy(str: string): number {
    if (!str || str.length === 0) return 0;
    const freqs: Record<string, number> = {};
    for (const char of str) {
      freqs[char] = (freqs[char] || 0) + 1;
    }
    let entropy = 0;
    const len = str.length;
    for (const count of Object.values(freqs)) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  public detectSecrets(text: string): SecretMatch[] {
    const matches: SecretMatch[] = [];
    const matchedTokens = new Set<string>();

    // 1. Regex pattern matching
    for (const regex of this.compiledPatterns) {
      const m = text.match(regex);
      if (m && m[0]) {
        matchedTokens.add(m[0]);
        matches.push({
          type: 'pattern',
          pattern: regex.source,
          sample: m[0].slice(0, 8) + '...',
        });
      }
    }

    // 2. High-entropy token detection (heuristic: words >= 20 chars with entropy > 4.5)
    const tokens = text.split(/[\s"',;()[\]{}]+/);
    for (const token of tokens) {
      if (token.length >= 24 && !token.includes('://')) {
        // If substring was already matched by regex, skip entropy check
        const alreadyMatched = Array.from(matchedTokens).some((m) => token.includes(m) || m.includes(token));
        if (alreadyMatched) continue;

        const entropy = this.calculateEntropy(token);
        if (entropy > 4.5) {
          // Check it has mixed characters (letters and numbers)
          const hasLetters = /[a-zA-Z]/.test(token);
          const hasNumbers = /[0-9]/.test(token);
          if (hasLetters && hasNumbers) {
            matches.push({
              type: 'entropy',
              pattern: `High entropy token (H=${entropy.toFixed(2)})`,
              sample: token.slice(0, 8) + '...',
            });
          }
        }
      }
    }

    return matches;
  }

  public recordToolExecution(
    toolName: string,
    args: Record<string, unknown>,
    resultContent: string,
  ): void {
    const targetPath = String(args['path'] || args['file'] || args['filepath'] || '');
    if (targetPath && this.isLocalOnlyPath(targetPath)) {
      this.taint(`Accessed local-only path: ${targetPath}`);
      return;
    }

    const secrets = this.detectSecrets(resultContent);
    if (secrets.length > 0) {
      this.taint(`Tool ${toolName} output contained sensitive patterns: ${secrets.map((s) => s.pattern || s.type).join(', ')}`);
    }
  }

  public checkMessages(messages: Message[]): PrivacyCheckResult {
    if (this.allowedOverride) {
      return { allowed: true, violations: [], tainted: this.sessionTainted };
    }

    const violations: SecretMatch[] = [];

    if (this.sessionTainted) {
      return {
        allowed: false,
        reason: `Session is tainted: ${this.taintReason || 'local-only data present'}`,
        violations,
        tainted: true,
      };
    }

    for (const msg of messages) {
      if (msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant' || msg.role === 'tool') {
        const text = msg.content;
        const matches = this.detectSecrets(text);
        if (matches.length > 0) {
          violations.push(...matches);
        }
      }
    }

    if (violations.length > 0) {
      return {
        allowed: false,
        reason: `Detected sensitive patterns in outgoing cloud payload: ${violations.map((v) => v.pattern || v.type).join(', ')}`,
        violations,
        tainted: this.sessionTainted,
      };
    }

    return { allowed: true, violations: [], tainted: false };
  }

  public enforce(messages: Message[]): void {
    const result = this.checkMessages(messages);
    if (!result.allowed) {
      if (this.config.failClosed) {
        throw new PrivacyBlocked('cloud transmission', result.reason || 'Privacy check failed');
      }
    }
  }
}
