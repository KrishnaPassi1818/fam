import { describe, it, expect } from 'vitest';
import {
  ModelError,
  ToolValidationError,
  PermissionDenied,
  PrivacyBlocked,
  BudgetExceeded,
  LoopDetected,
} from '../errors/index.js';

describe('Error Taxonomy', () => {
  it('instantiates ModelError with options', () => {
    const err = new ModelError('Out of VRAM', { isOom: true });
    expect(err.code).toBe('MODEL_ERROR');
    expect(err.isOom).toBe(true);
    expect(err.message).toBe('Out of VRAM');
  });

  it('formats ToolValidationError issues cleanly', () => {
    const err = new ToolValidationError('fs.read_file', [
      { path: 'path', message: 'is required' },
      { path: 'start_line', message: 'must be an integer' },
    ]);
    expect(err.code).toBe('TOOL_VALIDATION_ERROR');
    expect(err.message).toContain('`path`: is required');
    expect(err.message).toContain('`start_line`: must be an integer');
    expect(err.repairable).toBe(true);
  });

  it('creates PermissionDenied with tier details', () => {
    const err = new PermissionDenied('sandbox.run_command', 3, 'Command requires approval');
    expect(err.code).toBe('PERMISSION_DENIED');
    expect(err.tier).toBe(3);
    expect(err.message).toContain('tier 3');
  });

  it('creates PrivacyBlocked and BudgetExceeded', () => {
    const privErr = new PrivacyBlocked('.env', 'Matches secret pattern');
    expect(privErr.code).toBe('PRIVACY_BLOCKED');

    const budgetErr = new BudgetExceeded(9000, 8192);
    expect(budgetErr.code).toBe('BUDGET_EXCEEDED');
    expect(budgetErr.currentTokens).toBe(9000);
  });

  it('creates LoopDetected error', () => {
    const loopErr = new LoopDetected('fs.list_dir', 4);
    expect(loopErr.code).toBe('LOOP_DETECTED');
    expect(loopErr.repetitions).toBe(4);
  });
});
