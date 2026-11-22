import type { Intent, PrivacyLevel, RoutingDecision } from './types.js';

export type FastPathDecision = Omit<RoutingDecision, 'modelChain'>;

/**
 * Checks if prompt contains sensitive keywords or local file patterns
 * that require strict local execution.
 */
export function detectPrivacyFastPath(prompt: string): PrivacyLevel {
  const sensitivePatterns = [
    /(?:^|\W)\.env(?:\.[a-zA-Z0-9_-]+)?(?:\W|$)/i,
    /(?:^|\W)secrets?\.[a-zA-Z0-9]+(?:\W|$)/i,
    /\b(id_rsa|id_ed25519|\.pem|\.key)\b/i,
    /\b(password|passwords|secret_key|api_key|auth_token|bearer\s+token|private\s+key|credentials?|database_url)\b/i,
    /(?:AIza[0-9A-Za-z\-_]{35})/,
    /(?:sk-[a-zA-Z0-9]{48})/,
    /(?:ghp_[0-9a-zA-Z]{36})/,
  ];

  for (const pat of sensitivePatterns) {
    if (pat.test(prompt)) {
      return 'local_only';
    }
  }
  return 'normal';
}

/**
 * Estimates complexity on a 1-5 scale based on query indicators.
 */
export function estimateComplexity(prompt: string): number {
  const lower = prompt.toLowerCase();
  const words = prompt.trim().split(/\s+/).length;

  // Level 5: High complexity multi-system architectural re-architecting / migration
  if (
    /\b(rewrite the entire|migrate the codebase|full architectural overhaul|complete rewrite|rearchitect)\b/i.test(lower) ||
    (/\b(pipeline|architecture|database schema)\b/i.test(lower) && /\b(migrate|overhaul|redesign)\b/i.test(lower))
  ) {
    return 5;
  }

  // Level 4: Large multi-file refactoring / multi-step plan
  if (
    /\b(refactor across|multi-file|create a full-stack|end-to-end plan|comprehensive design)\b/i.test(lower) ||
    (/\brefactor\b/i.test(lower) && words > 12)
  ) {
    return 4;
  }

  // Level 3: Standard feature implementation or multi-step edit
  if (
    /\b(implement|create a new|build|add a feature|generate tests for all|unit tests and integration|caching layer)\b/i.test(lower) ||
    (/\band\b/i.test(lower) && /\bthen\b/i.test(lower)) ||
    words > 18
  ) {
    return 3;
  }

  // Level 2: Targeted bug fix or multi-item inspection
  if (
    /\b(fix(\s+(the|a))?\s+(bug|error|issue)|syntax\s+error|traceback|diagnose|find why|investigate|explain why|failing test)\b/i.test(lower) ||
    words > 7
  ) {
    return 2;
  }

  // Level 1: Quick inspection, single command, greeting, reading a file
  return 1;
}

/**
 * Rules fast-path classifier: returns high-confidence classification
 * without invoking any LLM, keeping latency < 1ms.
 */
export function matchFastPath(prompt: string): FastPathDecision | null {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();
  const privacy = detectPrivacyFastPath(trimmed);
  const complexity = estimateComplexity(trimmed);

  // 1. General Greeting / Small Talk fast path
  const greetingRegex = /^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening)|who\s+are\s+you|what\s+can\s+you\s+do|help|what\s+is\s+your\s+name|what\s+time\s+is\s+it)[\.!?]?$/i;
  const generalTopicRegex = /\b(tell\s+me\s+a\s+(funny\s+)?joke|principles\s+of|joke\s+about)\b/i;
  if (greetingRegex.test(lower) || generalTopicRegex.test(lower)) {
    return {
      intent: 'general',
      complexity: Math.max(1, complexity),
      categories: ['general'],
      needs_code: false,
      needs_web: false,
      needs_office: false,
      privacy,
      confidence: 0.98,
      reasoning: 'Matched general conversational pattern',
      source: 'rules',
    };
  }

  // 2. Git & Direct CLI command fast path
  const gitRegex = /^(git\s+(status|diff|log|branch|checkout|commit|push|pull|stash|show|add)|pnpm\s+(test|run|build|install)|npm\s+(test|run|build)|cargo\s+(test|build|check)|pytest|vitest|jest)/i;
  if (gitRegex.test(lower)) {
    return {
      intent: 'coding',
      complexity: 1,
      categories: ['git', 'fs', 'code'],
      needs_code: true,
      needs_web: false,
      needs_office: false,
      privacy,
      confidence: 0.98,
      reasoning: 'Matched direct git or build/test CLI command',
      source: 'rules',
    };
  }

  // 3. Office Documents fast path
  const officeDocRegex = /\b(xlsx|docx|pptx|spreadsheet|excel|powerpoint|word document|word doc|\.ods|\.odt|financial statements)\b/i;
  const officeActionRegex = /\b(open|read|create|edit|write|update|summarize|extract|convert|format)\s+(the\s+)?(spreadsheet|excel|sheet|doc|docx|pptx|presentation|slides|workbook|financial statements)\b/i;
  if (officeDocRegex.test(lower) || officeActionRegex.test(lower)) {
    return {
      intent: 'office',
      complexity: Math.max(1, complexity),
      categories: ['office', 'fs'],
      needs_code: false,
      needs_web: false,
      needs_office: true,
      privacy,
      confidence: 0.95,
      reasoning: 'Matched office document keyword or action',
      source: 'rules',
    };
  }

  // 4. Web Search fast path
  const webRegex = /\b(search\s+(the\s+)?web|search\s+online|look\s*up\s+on\s+(the\s+)?web|google\s+for|search\s+google|browse\s+(the\s+)?web|browse\s+to|fetch\s+https?:\/\/|scrape|curl\s+https?:\/\/|tutorials?\s+on|compare\s+features\s+of|latest\s+release\s+notes|latest\s+stock\s+prices)\b/i;
  if (webRegex.test(lower)) {
    return {
      intent: 'web',
      complexity: Math.max(1, complexity),
      categories: ['web'],
      needs_code: false,
      needs_web: true,
      needs_office: false,
      privacy,
      confidence: 0.95,
      reasoning: 'Matched web search or web retrieval intent',
      source: 'rules',
    };
  }

  // 5. System commands fast path
  const systemRegex = /\b(kill\s+process|ps\s+aux|htop|top|uptime|disk\s+space|df\s+-h|clipboard|system\s+notification|sysinfo|battery|cpu\s+usage|docker\s+containers|power\s+profile)\b/i;
  if (systemRegex.test(lower)) {
    return {
      intent: 'system',
      complexity: 1,
      categories: ['system'],
      needs_code: false,
      needs_web: false,
      needs_office: false,
      privacy,
      confidence: 0.95,
      reasoning: 'Matched system monitoring or process command',
      source: 'rules',
    };
  }

  // 6. Obvious coding / file manipulation fast path
  const codeRegex = /\b(syntax\s+error|typecheck|traceback|refactor|fix\s+(the\s+)?bug|write\s+a\s+(unit\s+)?test|implement|caching\s+layer|full-stack|build\s+pipeline|read_file|apply_edit|repo_map|package\.json|cargo\.toml|tsconfig\.json)\b/i;
  if (codeRegex.test(lower)) {
    return {
      intent: 'coding',
      complexity: Math.max(1, complexity),
      categories: ['code', 'fs'],
      needs_code: true,
      needs_web: false,
      needs_office: false,
      privacy,
      confidence: 0.95,
      reasoning: 'Matched software engineering or code debugging keywords',
      source: 'rules',
    };
  }

  // 7. Simple file reads fast path ("read file X", "show me file X", "cat X", "inspect the contents of X")
  const fileReadRegex = /^(read\s+file|show\s+me\s+file|cat\s+|open\s+file|inspect\s+the\s+contents\s+of)\s+([a-zA-Z0-9_\-\.\/]+)/i;
  if (fileReadRegex.test(lower)) {
    return {
      intent: 'coding',
      complexity: Math.max(1, complexity),
      categories: ['fs', 'code'],
      needs_code: true,
      needs_web: false,
      needs_office: false,
      privacy,
      confidence: 0.95,
      reasoning: 'Matched simple file read command',
      source: 'rules',
    };
  }

  // No high-confidence fast path match
  return null;
}

/**
 * Fallback classification when LLM is unavailable or fails.
 */
export function fallbackClassification(prompt: string): FastPathDecision {
  const privacy = detectPrivacyFastPath(prompt);
  const complexity = estimateComplexity(prompt);
  const lower = prompt.toLowerCase();

  let intent: Intent = 'general';
  const categories: string[] = ['general'];
  let needs_code = false;
  let needs_web = false;
  let needs_office = false;

  if (/\b(code|function|class|test|file|git|repo|bug|error|compile|typescript|python|rust|javascript)\b/i.test(lower)) {
    intent = 'coding';
    categories.push('fs', 'code');
    needs_code = true;
  } else if (/\b(doc|sheet|excel|pdf|word|slide|presentation|table|report)\b/i.test(lower)) {
    intent = 'office';
    categories.push('office', 'fs');
    needs_office = true;
  } else if (/\b(search|find|online|website|url|http|article|news)\b/i.test(lower)) {
    intent = 'web';
    categories.push('web');
    needs_web = true;
  } else if (/\b(process|system|os|memory|cpu|disk|terminal)\b/i.test(lower)) {
    intent = 'system';
    categories.push('system');
  }

  return {
    intent,
    complexity,
    categories,
    needs_code,
    needs_web,
    needs_office,
    privacy,
    confidence: 0.70,
    reasoning: 'Fallback heuristic classification',
    source: 'fallback',
  };
}
