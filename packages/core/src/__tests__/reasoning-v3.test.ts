import { describe, it, expect } from 'vitest';
import { TaskReasoningEngine } from '../loop/reasoning.js';

describe('TaskReasoningEngine (V3 Evolution)', () => {
  it('evaluates multi-step arithmetic, variables, and tax formulas', () => {
    const result = TaskReasoningEngine.evaluateMath('total = 4 * 24.50; tax = total * 0.085; net = total + tax');
    expect(result.result).toBeCloseTo(106.33, 2);
    expect(result.variables?.['total']).toBe(98);
    expect(result.variables?.['tax']).toBeCloseTo(8.33, 2);
  });

  it('calculates probability for rolling at least one 6 in three dice', () => {
    const p = TaskReasoningEngine.solveAtLeastOneProbability(6, 1, 3);
    expect(p.percentageFormatted).toBe('42.13%');
    expect(p.probability).toBeCloseTo(0.4213, 3);
  });

  it('calculates compound interest correctly', () => {
    const ci = TaskReasoningEngine.calculateCompoundInterest(10000, 5, 12, 3);
    expect(ci.futureValue).toBe(11614.72);
    expect(ci.interestEarned).toBe(1614.72);
  });

  it('computes percentage changes and trends', () => {
    const ch = TaskReasoningEngine.calculatePercentageChange(4500, 7200);
    expect(ch.percentage).toBe(60);
    expect(ch.isIncrease).toBe(true);
    expect(ch.formatted).toBe('60%');
  });

  it('performs topological sorting on dependency DAG without cycles', () => {
    const dag = TaskReasoningEngine.topologicalSort(
      ['build', 'test', 'package', 'deploy'],
      [
        { from: 'build', to: 'test' },
        { from: 'test', to: 'package' },
        { from: 'package', to: 'deploy' },
      ],
    );
    expect(dag.hasCycle).toBe(false);
    expect(dag.order).toEqual(['build', 'test', 'package', 'deploy']);
  });

  it('detects cycles in circular dependency graphs', () => {
    const dag = TaskReasoningEngine.topologicalSort(
      ['A', 'B', 'C'],
      [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
        { from: 'C', to: 'A' },
      ],
    );
    expect(dag.hasCycle).toBe(true);
  });

  it('schedules non-overlapping tasks avoiding lunch break', () => {
    const schedule = TaskReasoningEngine.scheduleNonOverlapping([
      { id: 'task1', durationHours: 2 },
      { id: 'task2', durationHours: 1 },
      { id: 'task3', durationHours: 2 },
    ]);
    expect(schedule.length).toBe(3);
    expect(schedule[0]?.startHour).toBe(9);
    expect(schedule[0]?.endHour).toBe(11);
    expect(schedule[1]?.startHour).toBe(11);
    expect(schedule[1]?.endHour).toBe(12);
    // After lunch (12-13)
    expect(schedule[2]?.startHour).toBe(13);
    expect(schedule[2]?.endHour).toBe(15);
  });
});
