import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { xlsx_query_sql } from '../tools/sql/query.js';
import { xlsx_create_from_csv, xlsx_add_sheet } from '../tools/write/xlsx.js';

describe('xlsx_query_sql (T7.3)', () => {
  let tempDir: string;
  let xlsxPath: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fam_sql_test_'));
    const csvPath = path.join(tempDir, 'sales.csv');
    fs.writeFileSync(
      csvPath,
      'Region,Product,Sales,Units,Date\n' +
      'North,Widget,150.50,10,2026-01-15\n' +
      'North,Gadget,200.00,5,2026-01-20\n' +
      'South,Widget,300.25,20,2026-02-10\n' +
      'East,Widget,120.00,8,2026-02-15\n' +
      'South,Gadget,450.75,15,2026-03-01\n',
      'utf-8',
    );
    xlsxPath = path.join(tempDir, 'company.xlsx');
    await xlsx_create_from_csv({ csvPath, xlsxPath, sheetName: 'Sales' });

    // Add second sheet for multi-sheet joins
    await xlsx_add_sheet({
      path: xlsxPath,
      sheetName: 'Targets',
      data: [
        ['Region', 'Target'],
        ['North', 300],
        ['South', 700],
        ['East', 150],
      ],
    });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('executes basic aggregation and group by', async () => {
    const res = await xlsx_query_sql({
      path: xlsxPath,
      sql: 'SELECT Region, SUM(Sales) as total_sales, SUM(Units) as total_units FROM Sales GROUP BY Region ORDER BY total_sales DESC',
    });

    expect(res.rowCount).toBe(3);
    expect(res.columns).toEqual(['Region', 'total_sales', 'total_units']);
    expect(res.rows[0]![0]).toBe('South');
    expect(Number(res.rows[0]![1])).toBeCloseTo(751.0, 1);
  });

  it('performs multi-table joins across sheets', async () => {
    const res = await xlsx_query_sql({
      path: xlsxPath,
      sql: `
        SELECT s.Region, SUM(s.Sales) as actual, t.Target as target
        FROM Sales s
        JOIN Targets t ON s.Region = t.Region
        GROUP BY s.Region
        ORDER BY s.Region ASC
      `,
    });

    expect(res.rowCount).toBe(3);
    expect(res.rows.find((r) => r[0] === 'North')![2]).toBe(300);
  });

  it('enforces read-only SQL and blocks destructive statements', async () => {
    await expect(
      xlsx_query_sql({
        path: xlsxPath,
        sql: 'DELETE FROM Sales WHERE Region = "North"',
      }),
    ).rejects.toThrow(/Security violation/);

    await expect(
      xlsx_query_sql({
        path: xlsxPath,
        sql: 'DROP TABLE Sales',
      }),
    ).rejects.toThrow(/Security violation/);

    await expect(
      xlsx_query_sql({
        path: xlsxPath,
        sql: 'INSERT INTO Sales VALUES ("West", "Toy", 100, 2, "2026-03-01")',
      }),
    ).rejects.toThrow(/Security violation/);
  });
});
