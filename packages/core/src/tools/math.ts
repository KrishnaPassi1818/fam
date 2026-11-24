/**
 * Safe, zero-eval recursive-descent mathematical expression evaluator.
 * Evaluates arbitrary arithmetic expressions, percentages, variables, and statistical functions
 * without using eval() or Function().
 */

export interface MathEvaluationResult {
  expression: string;
  result: number;
  formatted: string;
  variables?: Record<string, number>;
  lines?: Array<{ name?: string; expression: string; result: number; formatted: string }>;
}

export function evaluateMathExpression(input: string): MathEvaluationResult {
  if (!input || typeof input !== 'string' || input.trim().length === 0) {
    throw new Error('Empty mathematical expression');
  }

  // Check for multi-line or semicolon-separated statements
  const rawStatements = input
    .split(/[;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const variables: Record<string, number> = Object.create(null);
  const evaluatedLines: Array<{ name?: string; expression: string; result: number; formatted: string }> = [];
  let lastResult = 0;

  for (const stmt of rawStatements) {
    let varName: string | undefined;
    let exprPart = stmt;

    const eqIdx = stmt.indexOf('=');
    if (eqIdx > 0 && !/[<>=!]/.test(stmt[eqIdx - 1] ?? '') && !/[<>=!]/.test(stmt[eqIdx + 1] ?? '')) {
      const potentialName = stmt.slice(0, eqIdx).trim();
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(potentialName)) {
        varName = potentialName;
        exprPart = stmt.slice(eqIdx + 1).trim();
      }
    }

    const val = evaluateSingleExpression(exprPart, variables);
    lastResult = val;

    if (varName) {
      variables[varName] = val;
    }

    const cleanResult = Math.abs(val - Math.round(val)) < 1e-10 ? Math.round(val) : Number(val.toFixed(4));
    evaluatedLines.push({
      name: varName,
      expression: exprPart,
      result: cleanResult,
      formatted: cleanResult.toLocaleString('en-US', { maximumFractionDigits: 4 }),
    });
  }

  const cleanLast = Math.abs(lastResult - Math.round(lastResult)) < 1e-10 ? Math.round(lastResult) : Number(lastResult.toFixed(4));
  return {
    expression: input.trim(),
    result: cleanLast,
    formatted: cleanLast.toLocaleString('en-US', { maximumFractionDigits: 4 }),
    variables: Object.keys(variables).length > 0 ? variables : undefined,
    lines: evaluatedLines.length > 1 ? evaluatedLines : undefined,
  };
}

function evaluateSingleExpression(input: string, variables: Record<string, number>): number {
  // Pre-process: strip currency symbols, normalize commas in numbers, handle percentages
  let sanitized = input
    .replace(/[₹$€£¥]/g, '')
    .replace(/(\d),(\d)/g, '$1$2') // 2,000 -> 2000
    .trim();

  // Replace percentage expressions: e.g. "12%" -> "(0.12)" or "2000 * 12%" -> "2000 * 0.12"
  sanitized = sanitized.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1 / 100)');

  // Tokenizer
  const tokens = tokenize(sanitized);
  let pos = 0;

  function peek(): string | null {
    if (pos < tokens.length) {
      return tokens[pos] ?? null;
    }
    return null;
  }

  function consume(expected?: string): string {
    if (pos >= tokens.length) {
      throw new Error('Unexpected end of expression');
    }
    const token = tokens[pos];
    if (token === undefined) {
      throw new Error('Unexpected end of expression');
    }
    pos++;
    if (expected && token !== expected) {
      throw new Error(`Expected '${expected}', got '${token}'`);
    }
    return token;
  }

  function parseExpression(): number {
    return parseAdditive();
  }

  function parseAdditive(): number {
    let left = parseMultiplicative();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseMultiplicative();
      if (op === '+') left += right;
      else left -= right;
    }
    return left;
  }

  function parseMultiplicative(): number {
    let left = parsePower();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = consume();
      const right = parsePower();
      if (op === '*') {
        left *= right;
      } else if (op === '/') {
        if (right === 0) throw new Error('Division by zero');
        left /= right;
      } else if (op === '%') {
        if (right === 0) throw new Error('Modulo by zero');
        left %= right;
      }
    }
    return left;
  }

  function parsePower(): number {
    const base = parseUnary();
    if (peek() === '^') {
      consume();
      const exponent = parsePower();
      return Math.pow(base, exponent);
    }
    return base;
  }

  function parseUnary(): number {
    if (peek() === '+') {
      consume();
      return parseUnary();
    }
    if (peek() === '-') {
      consume();
      return -parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const token = peek();
    if (!token) throw new Error('Unexpected end of expression');

    if (token === '(') {
      consume('(');
      const val = parseExpression();
      consume(')');
      return val;
    }

    // Function calls or variable references
    if (isAlpha(token)) {
      const name = consume();
      const lower = name.toLowerCase();

      // Check if it's a function call
      if (peek() === '(') {
        consume('(');
        const args: number[] = [];
        if (peek() !== ')') {
          args.push(parseExpression());
          while (peek() === ',') {
            consume(',');
            args.push(parseExpression());
          }
        }
        consume(')');

        switch (lower) {
          case 'sum':
            return args.reduce((a, b) => a + b, 0);
          case 'avg':
          case 'average':
            if (args.length === 0) return 0;
            return args.reduce((a, b) => a + b, 0) / args.length;
          case 'min':
            if (args.length === 0) return 0;
            return Math.min(...args);
          case 'max':
            if (args.length === 0) return 0;
            return Math.max(...args);
          case 'round': {
            const first = args[0];
            if (first === undefined) return 0;
            const second = args[1];
            if (second !== undefined) {
              const factor = Math.pow(10, second);
              return Math.round(first * factor) / factor;
            }
            return Math.round(first);
          }
          case 'abs': {
            const first = args[0];
            if (first === undefined) return 0;
            return Math.abs(first);
          }
          case 'sqrt': {
            const first = args[0];
            if (first === undefined) return 0;
            return Math.sqrt(first);
          }
          default:
            throw new Error(`Unknown math function '${lower}'`);
        }
      }

      // Variable reference
      if (Object.prototype.hasOwnProperty.call(variables, name)) {
        return variables[name] ?? 0;
      }
      if (Object.prototype.hasOwnProperty.call(variables, lower)) {
        return variables[lower] ?? 0;
      }

      throw new Error(`Undefined variable or function '${name}'`);
    }

    // Number
    const num = Number(consume());
    if (isNaN(num)) {
      throw new Error(`Invalid numeric token '${token}'`);
    }
    return num;
  }

  const result = parseExpression();
  const remainingToken = peek();
  if (remainingToken !== null) {
    throw new Error(`Unexpected token '${remainingToken}' after complete expression`);
  }

  return result;
}

function isAlpha(str: string): boolean {
  return /^[a-zA-Z_]+$/.test(str);
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (ch === undefined) break;

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[+\-*/%^(),]/.test(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }

    // Numbers (including decimals)
    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < input.length) {
        const nextChar = input[i];
        if (nextChar !== undefined && /[0-9.]/.test(nextChar)) {
          numStr += nextChar;
          i++;
        } else {
          break;
        }
      }
      tokens.push(numStr);
      continue;
    }

    // Words / Functions / Variables
    if (/[a-zA-Z_]/.test(ch)) {
      let word = '';
      while (i < input.length) {
        const nextChar = input[i];
        if (nextChar !== undefined && /[a-zA-Z0-9_]/.test(nextChar)) {
          word += nextChar;
          i++;
        } else {
          break;
        }
      }
      tokens.push(word);
      continue;
    }

    throw new Error(`Invalid character '${ch}' in mathematical expression`);
  }

  return tokens;
}
