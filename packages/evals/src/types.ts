export type CheckType =
  | 'tool_called'
  | 'response_contains'
  | 'file_exists'
  | 'file_contains'
  | 'file_equals'
  | 'office_valid'
  | 'no_errors';

export interface EvalCheck {
  type: CheckType;
  tool?: string;
  args?: Record<string, unknown>;
  substring?: string;
  pattern?: string;
  path?: string;
  content?: string;
  name?: string;
}

export interface TaskDefinition {
  id: string;
  suite: string;
  description: string;
  prompt: string;
  fixtures?: Record<string, string>; // path -> content
  checks: EvalCheck[];
  expectedTools?: string[];
  timeoutMs?: number;
}

export interface CheckResult {
  name: string;
  type: CheckType;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  error?: string;
}

export interface TaskRunResult {
  taskId: string;
  suite: string;
  description: string;
  passed: boolean;
  score: number; // 0.0 to 1.0
  durationMs: number;
  tokensUsed: number;
  checkResults: CheckResult[];
  finalResponse: string;
  toolsInvoked: string[];
  error?: string;
}

export interface EvalSuiteReport {
  runId: string;
  suite: string;
  model: string;
  timestamp: string;
  tasksTotal: number;
  tasksPassed: number;
  scorePercent: number;
  durationMs: number;
  tokensUsed: number;
  taskResults: TaskRunResult[];
}
