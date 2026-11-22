import { describe, it, expect } from 'vitest';
import { uno_script } from '../tools/libreoffice/uno.js';

describe('Fallback UNO Script Runner (T7.10)', () => {
  it('executes inline Python code via python3.14 with uno access', async () => {
    const code = `
import uno
print(f"UNO module loaded successfully from: {uno.__file__}")
`;

    const res = await uno_script({ code });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('UNO module loaded successfully');
  });

  it('captures script arguments and standard output', async () => {
    const code = `
import sys
print("Args received:", sys.argv[1:])
`;

    const res = await uno_script({ code, args: ['--mode', 'batch', '--verbose'] });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("['--mode', 'batch', '--verbose']");
  });
});
