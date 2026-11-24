import type { NormalizedToolResult, ExecutionPlan } from '@fam/shared';

export interface FileObservation {
  path: string;
  content: string;
  timestamp: number;
  stale: boolean;
}

export interface DomObservation {
  url: string;
  title?: string;
  heading?: string;
  content: string;
  timestamp: number;
  stale: boolean;
  tabId?: string;
}

export interface BrowserSessionState {
  sessionId: string;
  activeTabId: string;
  currentUrl: string;
  title: string;
  tabs: Array<{ id: string; title: string; url: string }>;
  dom: DomObservation | null;
}

export interface StepRecord {
  stepNumber: number;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
  timestamp: number;
}

export interface SerializedTaskContext {
  taskId: string;
  userRequest: string;
  plan: ExecutionPlan | null;
  currentStep: number;
  previousSteps: StepRecord[];
  toolCalls: NormalizedToolResult[];
  toolOutputs: Record<string, unknown>;
  errors: Array<{ executionId?: string; tool?: string; error: string; timestamp: number }>;
  approvalDecisions: Array<{ executionId: string; tool: string; approved: boolean; reason?: string }>;
  browserSession: BrowserSessionState | null;
  currentWorkingDirectory: string;
  fileObservations: Record<string, FileObservation>;
  domObservation: DomObservation | null;
  verificationEvidence: string[];
  completionState: 'IDLE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  createdAt: number;
  updatedAt: number;
}

export class TaskContext {
  public readonly taskId: string;
  public readonly userRequest: string;
  public plan: ExecutionPlan | null = null;
  public currentStep = 0;
  public previousSteps: StepRecord[] = [];
  public toolCalls: NormalizedToolResult[] = [];
  public toolOutputs: Record<string, unknown> = {};
  public errors: Array<{ executionId?: string; tool?: string; error: string; timestamp: number }> = [];
  public approvalDecisions: Array<{ executionId: string; tool: string; approved: boolean; reason?: string }> = [];
  public browserSession: BrowserSessionState | null = null;
  public currentWorkingDirectory: string;
  public fileObservations: Map<string, FileObservation> = new Map();
  public domObservation: DomObservation | null = null;
  public verificationEvidence: string[] = [];
  public completionState: 'IDLE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' = 'IDLE';
  public readonly createdAt: number;
  public updatedAt: number;

  constructor(taskId: string, userRequest: string, cwd: string = process.cwd()) {
    this.taskId = taskId;
    this.userRequest = userRequest;
    this.currentWorkingDirectory = cwd;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  public setPlan(plan: ExecutionPlan): void {
    this.plan = plan;
    this.currentStep = 0;
    this.previousSteps = plan.steps.map((s, idx) => ({
      stepNumber: idx + 1,
      description: s.description,
      status: 'pending',
      timestamp: Date.now(),
    }));
    this.updatedAt = Date.now();
  }

  public advanceStep(stepNumber: number, status: StepRecord['status'] = 'completed', result?: unknown): void {
    this.currentStep = stepNumber;
    const existing = this.previousSteps.find((s) => s.stepNumber === stepNumber);
    if (existing) {
      existing.status = status;
      existing.result = result;
      existing.timestamp = Date.now();
    } else {
      this.previousSteps.push({
        stepNumber,
        description: `Step ${stepNumber}`,
        status,
        result,
        timestamp: Date.now(),
      });
    }
    this.updatedAt = Date.now();
  }

  public recordFileObservation(path: string, content: string): void {
    this.fileObservations.set(path, {
      path,
      content,
      timestamp: Date.now(),
      stale: false,
    });
    this.updatedAt = Date.now();
  }

  public invalidateFile(path: string): void {
    const obs = this.fileObservations.get(path);
    if (obs) {
      obs.stale = true;
      obs.timestamp = Date.now();
      this.updatedAt = Date.now();
    }
  }

  public getValidFileObservation(path: string): FileObservation | null {
    const obs = this.fileObservations.get(path);
    if (!obs || obs.stale) {
      return null;
    }
    return obs;
  }

  public recordDomObservation(dom: {
    url: string;
    title?: string;
    heading?: string;
    content: string;
    tabId?: string;
  }): void {
    this.domObservation = {
      ...dom,
      timestamp: Date.now(),
      stale: false,
    };
    if (this.browserSession) {
      this.browserSession.currentUrl = dom.url;
      if (dom.title) this.browserSession.title = dom.title;
      if (dom.tabId) this.browserSession.activeTabId = dom.tabId;
      this.browserSession.dom = this.domObservation;
    }
    this.updatedAt = Date.now();
  }

  public invalidateDom(newUrl?: string): void {
    if (this.domObservation) {
      this.domObservation.stale = true;
      this.domObservation.timestamp = Date.now();
    }
    if (newUrl) {
      if (!this.browserSession) {
        this.browserSession = {
          sessionId: 'session_default',
          activeTabId: 'tab_default',
          currentUrl: newUrl,
          title: '',
          tabs: [],
          dom: null,
        };
      } else {
        this.browserSession.currentUrl = newUrl;
      }
    }
    if (this.browserSession?.dom) {
      this.browserSession.dom.stale = true;
    }
    this.updatedAt = Date.now();
  }

  public getValidDomObservation(): DomObservation | null {
    if (!this.domObservation || this.domObservation.stale) {
      return null;
    }
    return this.domObservation;
  }

  public updateCwd(newCwd: string): void {
    this.currentWorkingDirectory = newCwd;
    this.updatedAt = Date.now();
  }

  public addEvidence(evidence: string): void {
    this.verificationEvidence.push(evidence);
    this.updatedAt = Date.now();
  }

  public recordApproval(executionId: string, tool: string, approved: boolean, reason?: string): void {
    this.approvalDecisions.push({ executionId, tool, approved, reason });
    this.updatedAt = Date.now();
  }

  public recordToolResult(result: NormalizedToolResult): void {
    this.toolCalls.push(result);
    this.toolOutputs[result.execution_id] = result.result;
    this.updatedAt = Date.now();

    if (result.status === 'failed' && result.error) {
      this.errors.push({
        executionId: result.execution_id,
        tool: result.tool,
        error: result.error,
        timestamp: Date.now(),
      });
    }

    // Automatic Invalidation and Context Synchronization Hooks
    const toolLower = result.tool.toLowerCase();
    const args = (result.arguments || {}) as Record<string, unknown>;

    // 1. Filesystem invalidation
    if (
      toolLower.includes('write_file') ||
      toolLower.includes('apply_edit') ||
      toolLower.includes('delete') ||
      toolLower.includes('move') ||
      toolLower.includes('trash')
    ) {
      const pathArg = (args.path || args.file || args.destination || args.target) as string | undefined;
      if (pathArg) {
        this.invalidateFile(pathArg);
      }
    } else if (toolLower.includes('read_file') || toolLower.includes('cat')) {
      const pathArg = (args.path || args.file) as string | undefined;
      if (pathArg && result.status === 'succeeded' && typeof result.result === 'string') {
        this.recordFileObservation(pathArg, result.result);
      }
    }

    // 2. Browser observation invalidation
    if (
      toolLower.includes('browser_navigate') ||
      toolLower.includes('browser_switch_tab') ||
      toolLower.includes('browser_close_tab') ||
      toolLower.includes('browser_reload')
    ) {
      const newUrl = args.url as string | undefined;
      this.invalidateDom(newUrl);
    } else if (toolLower.includes('browser_read_dom') || toolLower.includes('browser_read')) {
      if (result.status === 'succeeded' && result.result) {
        const resObj = (typeof result.result === 'object' && result.result !== null ? result.result : {}) as Record<string, unknown>;
        const content = typeof result.result === 'string' ? result.result : (resObj.content || resObj.dom || JSON.stringify(result.result)) as string;
        const currentUrl = (resObj.url || (this.browserSession ? this.browserSession.currentUrl : 'about:blank')) as string;
        const heading = resObj.heading as string | undefined;
        const title = resObj.title as string | undefined;
        this.recordDomObservation({
          url: currentUrl,
          title,
          heading,
          content,
        });
      }
    }

    // 3. Shell directory updates
    if (toolLower.includes('shell') || toolLower.includes('sandbox') || toolLower.includes('cd')) {
      const command = (args.command || '') as string;
      if (typeof command === 'string') {
        const cdMatch = command.match(/(?:^|[;&|]\s*)cd\s+([^\s;&|]+)/);
        if (cdMatch && cdMatch[1]) {
          this.updateCwd(cdMatch[1]);
        }
      }
      if (args.cwd && typeof args.cwd === 'string') {
        this.updateCwd(args.cwd);
      }
    }
  }

  public toJSON(): SerializedTaskContext {
    const files: Record<string, FileObservation> = {};
    for (const [k, v] of this.fileObservations.entries()) {
      files[k] = v;
    }

    return {
      taskId: this.taskId,
      userRequest: this.userRequest,
      plan: this.plan,
      currentStep: this.currentStep,
      previousSteps: this.previousSteps,
      toolCalls: this.toolCalls,
      toolOutputs: this.toolOutputs,
      errors: this.errors,
      approvalDecisions: this.approvalDecisions,
      browserSession: this.browserSession,
      currentWorkingDirectory: this.currentWorkingDirectory,
      fileObservations: files,
      domObservation: this.domObservation,
      verificationEvidence: this.verificationEvidence,
      completionState: this.completionState,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  public static fromJSON(data: SerializedTaskContext): TaskContext {
    const ctx = new TaskContext(data.taskId, data.userRequest, data.currentWorkingDirectory);
    ctx.plan = data.plan;
    ctx.currentStep = data.currentStep;
    ctx.previousSteps = data.previousSteps || [];
    ctx.toolCalls = data.toolCalls || [];
    ctx.toolOutputs = data.toolOutputs || {};
    ctx.errors = data.errors || [];
    ctx.approvalDecisions = data.approvalDecisions || [];
    ctx.browserSession = data.browserSession || null;
    ctx.domObservation = data.domObservation || null;
    ctx.verificationEvidence = data.verificationEvidence || [];
    ctx.completionState = data.completionState || 'IDLE';
    ctx.updatedAt = data.updatedAt || Date.now();

    if (data.fileObservations) {
      for (const [k, v] of Object.entries(data.fileObservations)) {
        ctx.fileObservations.set(k, v);
      }
    }

    return ctx;
  }
}

export class TaskContextManager {
  private tasks: Map<string, TaskContext> = new Map();
  private activeTaskId: string | null = null;

  public createTask(userRequest: string, cwd: string = process.cwd()): TaskContext {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ctx = new TaskContext(taskId, userRequest, cwd);
    this.tasks.set(taskId, ctx);
    this.activeTaskId = taskId;
    return ctx;
  }

  public getTask(taskId: string): TaskContext | undefined {
    return this.tasks.get(taskId);
  }

  public getActiveTask(): TaskContext | undefined {
    if (!this.activeTaskId) return undefined;
    return this.tasks.get(this.activeTaskId);
  }

  public setActiveTask(taskId: string): void {
    if (!this.tasks.has(taskId)) {
      throw new Error(`Task ${taskId} not found`);
    }
    this.activeTaskId = taskId;
  }

  public serialize(taskId: string): string {
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    return JSON.stringify(task.toJSON(), null, 2);
  }

  public deserialize(json: string): TaskContext {
    const data = JSON.parse(json) as SerializedTaskContext;
    const task = TaskContext.fromJSON(data);
    this.tasks.set(task.taskId, task);
    this.activeTaskId = task.taskId;
    return task;
  }

  public clear(): void {
    this.tasks.clear();
    this.activeTaskId = null;
  }
}
