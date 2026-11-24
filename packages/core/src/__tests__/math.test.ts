import { describe, it, expect } from 'vitest';
import { evaluateMathExpression } from '../tools/math.js';

describe('evaluateMathExpression', () => {
  it('correctly calculates the sum of arbitrary price arrays', () => {
    const res = evaluateMathExpression('250 + 450 + 120 + 800 + 380');
    expect(res.result).toBe(2000);
    expect(res.formatted).toBe('2,000');
  });

  it('evaluates averages both with division and avg() function', () => {
    const div = evaluateMathExpression('2000 / 5');
    expect(div.result).toBe(400);

    const func = evaluateMathExpression('avg(250, 450, 120, 800, 380)');
    expect(func.result).toBe(400);
  });

  it('correctly evaluates percentage discounts and remaining amounts', () => {
    const discount = evaluateMathExpression('2000 * 12%');
    expect(discount.result).toBe(240);

    const net = evaluateMathExpression('2000 - (2000 * 12%)');
    expect(net.result).toBe(1760);
  });

  it('correctly calculates budget allocations and daily limits', () => {
    const remaining = evaluateMathExpression('5000 - 1200 - 800 - 1000');
    expect(remaining.result).toBe(2000);

    const daily = evaluateMathExpression('2000 / 30');
    expect(daily.result).toBeCloseTo(66.6667, 3);
  });

  it('strips currency symbols and handles thousands commas', () => {
    const res = evaluateMathExpression('₹2,500 + ₹1,500 - $800');
    expect(res.result).toBe(3200);
  });

  it('throws on division by zero', () => {
    expect(() => evaluateMathExpression('100 / 0')).toThrow(/Division by zero/);
  });

  it('evaluates power and nested parentheses', () => {
    const res = evaluateMathExpression('2 ^ 3 + (10 - 2) * 2');
    expect(res.result).toBe(24);
  });

  it('evaluates multi-statement formulas with variables', () => {
    const input = 'total = 250 + 450 + 120 + 800 + 380; avg = total / 5; discount = total * 0.12; net = total - discount';
    const res = evaluateMathExpression(input);
    expect(res.result).toBe(1760);
    expect(res.variables).toBeDefined();
    expect(res.variables!['total']).toBe(2000);
    expect(res.variables!['avg']).toBe(400);
    expect(res.variables!['discount']).toBe(240);
    expect(res.variables!['net']).toBe(1760);
    expect(res.lines).toHaveLength(4);
  });
});
