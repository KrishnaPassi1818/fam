import { describe, it, expect } from 'vitest';
import { AgentStateMachine, type AgentExecutionState } from '../loop/state-machine.js';

describe('AgentStateMachine', () => {
  it('initializes in IDLE state', () => {
    const sm = new AgentStateMachine();
    expect(sm.getState()).toBe('IDLE');
    expect(sm.getHistory().length).toBeGreaterThan(0);
  });

  it('allows valid progressive lifecycle transitions', () => {
    const sm = new AgentStateMachine();
    const states: AgentExecutionState[] = [];
    sm.onStateChange((to) => states.push(to));

    sm.transition('UNDERSTANDING', 'Processing user input');
    expect(sm.getState()).toBe('UNDERSTANDING');

    sm.transition('PLANNING', 'Decomposing task');
    expect(sm.getState()).toBe('PLANNING');

    sm.transition('DISCOVERING_TOOLS', 'Retrieving relevant MCP schemas');
    expect(sm.getState()).toBe('DISCOVERING_TOOLS');

    sm.transition('REASONING', 'Model inference');
    expect(sm.getState()).toBe('REASONING');

    sm.transition('WAITING_FOR_PERMISSION', 'Checking security tier');
    expect(sm.getState()).toBe('WAITING_FOR_PERMISSION');

    sm.transition('EXECUTING', 'Running tool');
    expect(sm.getState()).toBe('EXECUTING');

    sm.transition('OBSERVING', 'Capturing tool output');
    expect(sm.getState()).toBe('OBSERVING');

    sm.transition('RECOVERING', 'Adjusting argument or retrying');
    expect(sm.getState()).toBe('RECOVERING');

    sm.transition('REASONING', 'Subsequent turn');
    expect(sm.getState()).toBe('REASONING');

    sm.transition('VERIFYING', 'Verifying outcome');
    expect(sm.getState()).toBe('VERIFYING');

    sm.transition('COMPLETED', 'Finished task');
    expect(sm.getState()).toBe('COMPLETED');

    expect(states).toEqual([
      'UNDERSTANDING',
      'PLANNING',
      'DISCOVERING_TOOLS',
      'REASONING',
      'WAITING_FOR_PERMISSION',
      'EXECUTING',
      'OBSERVING',
      'RECOVERING',
      'REASONING',
      'VERIFYING',
      'COMPLETED',
    ]);
  });

  it('rejects invalid state jumps', () => {
    const sm = new AgentStateMachine();
    expect(() => sm.transition('COMPLETED')).toThrowError(/Invalid state transition/);
  });

  it('allows emergency transitions to FAILED or CANCELLED from active states', () => {
    const sm = new AgentStateMachine();
    sm.transition('UNDERSTANDING');
    sm.transition('CANCELLED', 'User abort');
    expect(sm.getState()).toBe('CANCELLED');

    const sm2 = new AgentStateMachine();
    sm2.transition('UNDERSTANDING');
    sm2.transition('FAILED', 'Model timeout');
    expect(sm2.getState()).toBe('FAILED');
  });
});
