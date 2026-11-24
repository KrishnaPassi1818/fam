import { evaluateMathExpression, type MathEvaluationResult } from '../tools/math.js';

export interface ProbabilityResult {
  probability: number;
  percentageFormatted: string;
  explanation: string;
}

export interface CompoundInterestResult {
  principal: number;
  futureValue: number;
  formatted: string;
  interestEarned: number;
}

export interface ScheduledTaskSlot {
  id: string;
  startHour: number;
  endHour: number;
}

export interface TopologicalSortResult {
  order: string[];
  hasCycle: boolean;
}

export class TaskReasoningEngine {
  /**
   * Safely evaluate arithmetic formulas, variables, and multi-step math
   */
  public static evaluateMath(expression: string): MathEvaluationResult {
    return evaluateMathExpression(expression);
  }

  /**
   * Solve probability questions (e.g. at least one success in N trials)
   */
  public static solveAtLeastOneProbability(sides = 6, targetOutcomeCount = 1, trials = 3): ProbabilityResult {
    const pSingleSuccess = targetOutcomeCount / sides;
    const pSingleFailure = 1 - pSingleSuccess;
    const pAllFailures = Math.pow(pSingleFailure, trials);
    const pAtLeastOne = 1 - pAllFailures;
    const pct = Number((pAtLeastOne * 100).toFixed(2));

    return {
      probability: pAtLeastOne,
      percentageFormatted: `${pct}%`,
      explanation: `1 - (${sides - targetOutcomeCount}/${sides})^${trials} = 1 - (${pSingleFailure.toFixed(4)})^${trials} = ${pct}%`,
    };
  }

  /**
   * Calculate compound interest: A = P * (1 + r/n)^(n*t)
   */
  public static calculateCompoundInterest(
    principal: number,
    annualRatePercent: number,
    compoundingFreqPerYear: number,
    years: number,
  ): CompoundInterestResult {
    const r = annualRatePercent / 100;
    const n = compoundingFreqPerYear;
    const t = years;
    const amount = principal * Math.pow(1 + r / n, n * t);
    const rounded = Number(amount.toFixed(2));

    return {
      principal,
      futureValue: rounded,
      formatted: rounded.toFixed(2),
      interestEarned: Number((rounded - principal).toFixed(2)),
    };
  }

  /**
   * Calculate percentage increase or decrease between original and new values
   */
  public static calculatePercentageChange(original: number, updated: number): {
    change: number;
    percentage: number;
    formatted: string;
    isIncrease: boolean;
  } {
    const diff = updated - original;
    const pct = Number(((diff / original) * 100).toFixed(2));
    return {
      change: diff,
      percentage: Math.abs(pct),
      formatted: `${Math.abs(pct)}%`,
      isIncrease: diff >= 0,
    };
  }

  /**
   * Perform topological sorting of dependency graph (Kahn's algorithm)
   */
  public static topologicalSort(
    nodes: string[],
    dependencies: Array<{ from: string; to: string }>, // 'from' must precede 'to'
  ): TopologicalSortResult {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const n of nodes) {
      inDegree.set(n, 0);
      adj.set(n, []);
    }

    for (const dep of dependencies) {
      const current = inDegree.get(dep.to) ?? 0;
      inDegree.set(dep.to, current + 1);
      adj.get(dep.from)?.push(dep.to);
    }

    const queue: string[] = [];
    for (const [node, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(node);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      order.push(curr);

      const neighbors = adj.get(curr) || [];
      for (const next of neighbors) {
        const d = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, d);
        if (d === 0) {
          queue.push(next);
        }
      }
    }

    return {
      order,
      hasCycle: order.length < nodes.length,
    };
  }

  /**
   * Schedule non-overlapping tasks within daily working hours
   */
  public static scheduleNonOverlapping(
    tasks: Array<{ id: string; durationHours: number }>,
    workDayStart = 9,
    workDayEnd = 17,
    lunchStart = 12,
    lunchEnd = 13,
  ): ScheduledTaskSlot[] {
    const schedule: ScheduledTaskSlot[] = [];
    let currentHour = workDayStart;

    for (const task of tasks) {
      // If task crosses lunch, skip lunch
      if (currentHour >= lunchStart && currentHour < lunchEnd) {
        currentHour = lunchEnd;
      }
      if (currentHour + task.durationHours > lunchStart && currentHour < lunchStart) {
        currentHour = lunchEnd;
      }

      if (currentHour + task.durationHours <= workDayEnd) {
        schedule.push({
          id: task.id,
          startHour: currentHour,
          endHour: currentHour + task.durationHours,
        });
        currentHour += task.durationHours;
      }
    }

    return schedule;
  }
}
