/**
 * Agent Execution State Machine
 *
 * Implements explicit execution states and transitions as required by the
 * Master Engineering Directive (Phase Two):
 *
 * IDLE -> UNDERSTANDING -> PLANNING -> DISCOVERING_TOOLS -> REASONING
 *      <-> WAITING_FOR_PERMISSION
 *      <-> EXECUTING
 *      <-> OBSERVING
 *      <-> RECOVERING
 *      -> VERIFYING
 *      -> COMPLETED | FAILED | CANCELLED
 */

export type AgentExecutionState =
  | 'IDLE'
  | 'PLANNING'
  | 'TOOL_SELECTION'
  | 'AWAITING_APPROVAL'
  | 'EXECUTING'
  | 'OBSERVING'
  | 'VERIFYING'
  | 'REPLANNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  // Backward compatibility aliases
  | 'UNDERSTANDING'
  | 'DISCOVERING_TOOLS'
  | 'REASONING'
  | 'WAITING_FOR_PERMISSION'
  | 'RECOVERING';

export interface StateTransitionRecord {
  from: AgentExecutionState;
  to: AgentExecutionState;
  timestamp: number;
  detail?: string;
}

export type StateChangeListener = (
  to: AgentExecutionState,
  from: AgentExecutionState,
  detail?: string,
) => void;

/**
 * Valid state transition adjacency table.
 * Controls strict, verifiable state progression.
 */
const ALLOWED_TRANSITIONS: Record<AgentExecutionState, readonly AgentExecutionState[]> = {
  IDLE: [
    'PLANNING',
    'TOOL_SELECTION',
    'AWAITING_APPROVAL',
    'EXECUTING',
    'UNDERSTANDING',
    'DISCOVERING_TOOLS',
    'REASONING',
    'CANCELLED',
    'FAILED',
  ],
  PLANNING: [
    'TOOL_SELECTION',
    'AWAITING_APPROVAL',
    'EXECUTING',
    'DISCOVERING_TOOLS',
    'REASONING',
    'FAILED',
    'CANCELLED',
  ],
  TOOL_SELECTION: [
    'AWAITING_APPROVAL',
    'EXECUTING',
    'PLANNING',
    'REASONING',
    'FAILED',
    'CANCELLED',
  ],
  AWAITING_APPROVAL: [
    'EXECUTING',
    'REPLANNING',
    'RECOVERING',
    'PLANNING',
    'FAILED',
    'CANCELLED',
  ],
  EXECUTING: ['OBSERVING', 'REPLANNING', 'RECOVERING', 'FAILED', 'CANCELLED'],
  OBSERVING: [
    'VERIFYING',
    'REPLANNING',
    'TOOL_SELECTION',
    'PLANNING',
    'RECOVERING',
    'REASONING',
    'FAILED',
    'CANCELLED',
  ],
  VERIFYING: [
    'COMPLETED',
    'REPLANNING',
    'PLANNING',
    'EXECUTING',
    'RECOVERING',
    'REASONING',
    'FAILED',
    'CANCELLED',
  ],
  REPLANNING: [
    'PLANNING',
    'TOOL_SELECTION',
    'EXECUTING',
    'REASONING',
    'FAILED',
    'CANCELLED',
  ],
  COMPLETED: ['IDLE', 'PLANNING', 'UNDERSTANDING'],
  FAILED: ['IDLE', 'PLANNING', 'UNDERSTANDING'],
  CANCELLED: ['IDLE', 'PLANNING', 'UNDERSTANDING'],

  // Backward-compatibility transitions
  UNDERSTANDING: [
    'PLANNING',
    'TOOL_SELECTION',
    'DISCOVERING_TOOLS',
    'REASONING',
    'FAILED',
    'CANCELLED',
  ],
  DISCOVERING_TOOLS: [
    'REASONING',
    'TOOL_SELECTION',
    'PLANNING',
    'FAILED',
    'CANCELLED',
  ],
  REASONING: [
    'AWAITING_APPROVAL',
    'WAITING_FOR_PERMISSION',
    'EXECUTING',
    'VERIFYING',
    'COMPLETED',
    'REPLANNING',
    'RECOVERING',
    'PLANNING',
    'DISCOVERING_TOOLS',
    'TOOL_SELECTION',
    'FAILED',
    'CANCELLED',
  ],
  WAITING_FOR_PERMISSION: [
    'EXECUTING',
    'RECOVERING',
    'REPLANNING',
    'REASONING',
    'FAILED',
    'CANCELLED',
  ],
  RECOVERING: [
    'PLANNING',
    'REASONING',
    'DISCOVERING_TOOLS',
    'TOOL_SELECTION',
    'EXECUTING',
    'REPLANNING',
    'FAILED',
    'CANCELLED',
  ],
};

export class AgentStateMachine {
  private currentState: AgentExecutionState = 'IDLE';
  private readonly history: StateTransitionRecord[] = [];
  private readonly listeners: Set<StateChangeListener> = new Set();

  constructor(initialState: AgentExecutionState = 'IDLE') {
    this.currentState = initialState;
    this.history.push({
      from: 'IDLE',
      to: initialState,
      timestamp: Date.now(),
      detail: 'State machine initialized',
    });
  }

  public getState(): AgentExecutionState {
    return this.currentState;
  }

  public getHistory(): readonly StateTransitionRecord[] {
    return this.history;
  }

  public onStateChange(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public canTransitionTo(targetState: AgentExecutionState): boolean {
    const allowed = ALLOWED_TRANSITIONS[this.currentState];
    return allowed ? allowed.includes(targetState) : false;
  }

  public transition(targetState: AgentExecutionState, detail?: string): void {
    if (this.currentState === targetState) {
      return; // No-op if already in state
    }

    if (!this.canTransitionTo(targetState)) {
      // If direct transition is not allowed, check if emergency fail/cancel is valid
      if (targetState === 'FAILED' || targetState === 'CANCELLED') {
        // Always permit transition to FAILED or CANCELLED from any non-terminal state
      } else {
        throw new Error(
          `Invalid state transition: Cannot transition from '${this.currentState}' to '${targetState}'`,
        );
      }
    }

    const previous = this.currentState;
    this.currentState = targetState;
    const record: StateTransitionRecord = {
      from: previous,
      to: targetState,
      timestamp: Date.now(),
      detail,
    };
    this.history.push(record);

    for (const listener of this.listeners) {
      try {
        listener(targetState, previous, detail);
      } catch {
        // Prevent listener exception from breaking the state machine
      }
    }
  }

  public reset(): void {
    this.currentState = 'IDLE';
    this.history.length = 0;
  }
}
