export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

export type DifficultyLabel =
  | 'basic'
  | 'intermediate'
  | 'advanced'
  | 'expert'
  | 'adversarial';

export type DomainCategory =
  | 'os_admin'
  | 'filesystem'
  | 'terminal_code'
  | 'browser_anarc'
  | 'reasoning_planning'
  | 'data_analysis'
  | 'distributed_networking'
  | 'software_git'
  | 'mcp_orchestration'
  | 'memory_context'
  | 'security_auth'
  | 'long_horizon';

export type SplitType = 'dev' | 'val' | 'holdout';

export type SafetyClassification =
  | 'read_only'
  | 'workspace_write'
  | 'system_admin'
  | 'destructive'
  | 'critical_security';

export interface ScoringRubric {
  correctnessWeight: number; // default 0.30
  toolSelectionWeight: number; // default 0.15
  executionVerificationWeight: number; // default 0.15
  reasoningPlanningWeight: number; // default 0.10
  recoveryResilienceWeight: number; // default 0.10
  efficiencyWeight: number; // default 0.10
  safetyComplianceWeight: number; // default 0.10
}

export interface ExpectedResultSpec {
  type:
    | 'file_exists'
    | 'file_contains'
    | 'json_match'
    | 'regex_match'
    | 'command_exit'
    | 'tool_called'
    | 'permission_denied'
    | 'custom_check';
  path?: string;
  substring?: string;
  pattern?: string;
  expectedValue?: unknown;
  command?: string;
  expectedExitCode?: number;
  forbiddenTools?: string[];
  forbiddenSubstrings?: string[];
}

export interface V3BenchmarkTask {
  id: string;
  domain: DomainCategory;
  difficulty: DifficultyLevel;
  difficultyLabel: DifficultyLabel;
  split: SplitType;
  prompt: string;
  expectedBehavior: string;
  availableTools: string[];
  requiredPermissions: string[];
  preconditions?: {
    files?: Record<string, string>;
    env?: Record<string, string>;
    setupCommands?: string[];
  };
  expectedObservations: string[];
  expectedResult: ExpectedResultSpec;
  verificationMethod: string;
  timeLimit: number;
  safetyClassification: SafetyClassification;
  scoringRubric: ScoringRubric;
}

export type FailureCategory =
  | 'MODEL_REASONING'
  | 'PROMPT_CONSTRUCTION'
  | 'PLANNING'
  | 'TOOL_SELECTION'
  | 'TOOL_ARGUMENT_GENERATION'
  | 'TOOL_REGISTRATION'
  | 'MCP_TRANSPORT'
  | 'PERMISSION_HANDLING'
  | 'EXECUTION'
  | 'RESULT_PARSING'
  | 'VERIFICATION'
  | 'CONTEXT_MANAGEMENT'
  | 'BROWSER_INTEGRATION'
  | 'RENDERING'
  | 'PERFORMANCE'
  | 'EXTERNAL_DEPENDENCY'
  | 'SECURITY_VIOLATION';

export interface DimensionScores {
  correctness: number; // 0 - 100
  toolSelection: number; // 0 - 100
  executionVerification: number; // 0 - 100
  reasoningPlanning: number; // 0 - 100
  recoveryResilience: number; // 0 - 100
  efficiency: number; // 0 - 100
  safetyCompliance: number; // 0 - 100
}

export interface TaskExecutionResult {
  taskId: string;
  domain: DomainCategory;
  difficulty: DifficultyLevel;
  split: SplitType;
  prompt: string;
  passed: boolean;
  verified: boolean;
  score: number; // 0 - 100
  dimensionScores: DimensionScores;
  toolSelectionAccuracy: number; // 0 or 1
  argumentAccuracy: number; // 0 or 1
  executionSuccess: boolean;
  falseSuccessClaim: boolean;
  hallucinatedObservation: boolean;
  staleObservationLeakage: boolean;
  permissionDecisionAccuracy: number; // 0 or 1
  unsafeAction: boolean;
  recoveryAfterFailure: boolean;
  toolCallsCount: number;
  toolsInvoked: string[];
  retries: number;
  durationMs: number;
  tokensUsed: number;
  memoryMb: number;
  cpuPercent: number;
  gpuVramMib: number;
  finalResponse: string;
  failureCategory?: FailureCategory;
  error?: string;
  verificationDetails?: string;
}

export interface V3BenchmarkReport {
  timestamp: string;
  engineVersion: string;
  model: string;
  totalTasks: number;
  passedTasks: number;
  verifiedTasks: number;
  failedTasks: number;
  unsafeTasks: number;
  completionRate: number;
  verifiedCompletionRate: number;
  averageScore: number;
  toolSelectionAccuracy: number;
  toolArgumentAccuracy: number;
  toolExecutionSuccessRate: number;
  falseSuccessRate: number;
  hallucinatedObservationRate: number;
  staleObservationLeakageRate: number;
  permissionDecisionAccuracy: number;
  unsafeActionRate: number;
  recoveryRate: number;
  averageToolCallsPerTask: number;
  retryFrequency: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  averageTokensUsed: number;
  memoryMb: number;
  cpuPercent: number;
  gpuVramMib: number;
  anarcStartupReliability: number;
  browserNavigationSuccess: number;
  mcpAvailability: number;
  contextUtilization: number;
  domainBreakdown: Record<DomainCategory, {
    total: number;
    passed: number;
    verified: number;
    avgScore: number;
    completionRate: number;
  }>;
  difficultyBreakdown: Record<DifficultyLevel, {
    total: number;
    passed: number;
    avgScore: number;
    completionRate: number;
  }>;
  splitBreakdown: Record<SplitType, {
    total: number;
    passed: number;
    avgScore: number;
    completionRate: number;
  }>;
  failureDistribution: Record<FailureCategory, number>;
  taskResults: TaskExecutionResult[];
}
