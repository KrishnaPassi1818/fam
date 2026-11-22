import { describe, it, expect } from 'vitest';
import { VERSION } from './index.js';

describe('shared', () => {
  it('exports version', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
