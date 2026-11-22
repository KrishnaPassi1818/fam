import { describe, it, expect } from 'vitest';
import { runDoctor, formatDoctorTable, type DoctorReport } from '../doctor/index.js';

describe('hx doctor', () => {
  it('runs doctor checks and returns valid structured report', async () => {
    const report = await runDoctor();
    expect(report.timestamp).toBeDefined();
    expect(Array.isArray(report.items)).toBe(true);
    expect(report.items.length).toBeGreaterThan(5);

    const osCheck = report.items.find((i) => i.name === 'Operating System');
    expect(osCheck).toBeDefined();
    expect(osCheck?.status).toBe('PASS');

    const nodeCheck = report.items.find((i) => i.name === 'Node.js');
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck?.status).toBe('PASS');
  });

  it('formats doctor report table cleanly', () => {
    const mockReport: DoctorReport = {
      timestamp: new Date().toISOString(),
      allPassed: true,
      items: [
        {
          name: 'Operating System',
          category: 'system',
          status: 'PASS',
          details: 'Linux Omarchy',
          required: true,
        },
        {
          name: 'Gemini API Key',
          category: 'ai',
          status: 'WARN',
          details: 'Key not set',
          required: false,
        },
      ],
    };
    const table = formatDoctorTable(mockReport);
    expect(table).toContain('=== hx doctor environment inspection ===');
    expect(table).toContain('PASS');
    expect(table).toContain('WARN');
    expect(table).toContain('Operating System');
  });
});
