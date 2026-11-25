export abstract class FamError extends Error {
  public readonly code: string;
  public readonly details?: unknown;
  public readonly timestamp: number;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export { FamError as HxError };

export class ModelError extends FamError {
  public readonly isOom?: boolean;
  public readonly isRateLimit?: boolean;
  public readonly isTimeout?: boolean;

  constructor(
    message: string,
    options?: { isOom?: boolean; isRateLimit?: boolean; isTimeout?: boolean; details?: unknown },
  ) {
    super(message, 'MODEL_ERROR', options?.details);
    this.isOom = options?.isOom;
    this.isRateLimit = options?.isRateLimit;
    this.isTimeout = options?.isTimeout;
  }
}

export interface ValidationIssue {
  path: string;
  message: string;
  expected?: string;
  actual?: unknown;
}

export class ToolValidationError extends FamError {
  public readonly toolName: string;
  public readonly issues: ValidationIssue[];
  public readonly repairable: boolean;

  constructor(toolName: string, issues: ValidationIssue[], repairable = true) {
    const formatted = issues.map((i) => `- \`${i.path}\`: ${i.message}`).join('\n');
    super(
      `Tool call rejected for ${toolName}:\n${formatted}`,
      'TOOL_VALIDATION_ERROR',
      { toolName, issues, repairable },
    );
    this.toolName = toolName;
    this.issues = issues;
    this.repairable = repairable;
  }
}

export class ToolExecError extends FamError {
  public readonly toolName: string;

  constructor(toolName: string, message: string, details?: unknown) {
    super(`Tool ${toolName} execution failed: ${message}`, 'TOOL_EXEC_ERROR', details);
    this.toolName = toolName;
  }
}

export class PermissionDenied extends FamError {
  public readonly toolName: string;
  public readonly tier: number;

  constructor(toolName: string, tier: number, reason?: string) {
    super(
      `Permission denied for tool ${toolName} (tier ${tier})${reason ? `: ${reason}` : ''}`,
      'PERMISSION_DENIED',
      { toolName, tier, reason },
    );
    this.toolName = toolName;
    this.tier = tier;
  }
}

export class PrivacyBlocked extends FamError {
  public readonly target: string;
  public readonly reason: string;

  constructor(target: string, reason: string) {
    super(`Privacy policy blocked transmission of ${target}: ${reason}`, 'PRIVACY_BLOCKED', {
      target,
      reason,
    });
    this.target = target;
    this.reason = reason;
  }
}

export class BudgetExceeded extends FamError {
  public readonly currentTokens: number;
  public readonly maxTokens: number;

  constructor(currentTokens: number, maxTokens: number, resource = 'tokens') {
    super(
      `${resource.charAt(0).toUpperCase() + resource.slice(1)} budget exceeded: ${currentTokens} ${resource} exceeds limit of ${maxTokens}`,
      'BUDGET_EXCEEDED',
      { currentTokens, maxTokens, resource },
    );
    this.currentTokens = currentTokens;
    this.maxTokens = maxTokens;
  }
}

export class LoopDetected extends FamError {
  public readonly toolName: string;
  public readonly repetitions: number;

  constructor(toolName: string, repetitions: number) {
    super(
      `Repetition loop detected: ${toolName} called with identical arguments ${repetitions} times`,
      'LOOP_DETECTED',
      { toolName, repetitions },
    );
    this.toolName = toolName;
    this.repetitions = repetitions;
  }
}
