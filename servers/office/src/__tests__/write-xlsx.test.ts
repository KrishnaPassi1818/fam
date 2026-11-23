import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  xlsx_write_cells,
  xlsx_add_formula,
  xlsx_add_sheet,
  xlsx_create_from_csv,
} from '../tools/write/xlsx.js';
import { xlsx_describe, xlsx_read_range } from '../tools/read/xlsx.js';

describe('XLSX Write Tools (T7.4)', () => {
  let tempDir: string;
  let xlsxPath: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fam_xlsx_write_test_'));
    const csvPath = path.join(tempDir, 'init.csv');
    fs.writeFileSync(csvPath, 'Item,Price,Qty\nApple,1.5,10\nBanana,0.8,20\n', 'utf-8');
    xlsxPath = path.join(tempDir, 'groceries.xlsx');
    await xlsx_create_from_csv({ csvPath, xlsxPath, sheetName: 'Inventory' });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('xlsx_write_cells modifies specified cells while preserving formatting', async () => {
    const res = await xlsx_write_cells({
      path: xlsxPath,
      sheet: 'Inventory',
      cells: [
        { cell: 'B2', value: 2.0 }, // Apple price changed
        { cell: 'C2', value: 15 },  // Apple qty changed
      ],
    });

    expect(res.result.updatedCount).toBe(2);
    expect(res.verified).toBe(true);
    expect(res.backupPath).toBeDefined();

    const range = await xlsx_read_range({ path: xlsxPath, range: 'B2:C2' });
    expect(range.content).toContain('2 | 15');
  });

  it('xlsx_add_formula writes calculating formulas', async () => {
    const res = await xlsx_add_formula({
      path: xlsxPath,
      sheet: 'Inventory',
      cell: 'D2',
      formula: '=B2*C2',
    });

    expect(res.result.formula).toBe('B2*C2');
    expect(res.verified).toBe(true);
  });

  it('xlsx_add_sheet creates new worksheet with populated rows', async () => {
    const res = await xlsx_add_sheet({
      path: xlsxPath,
      sheetName: 'Suppliers',
      data: [
        ['Supplier', 'Contact'],
        ['FarmFresh', 'alice@farm.com'],
      ],
    });

    expect(res.result.sheetName).toBe('Suppliers');
    expect(res.result.rowCount).toBe(2);

    const desc = await xlsx_describe(xlsxPath);
    expect(desc.sheetCount).toBe(2);
    expect(desc.sheets.map((s) => s.name)).toContain('Suppliers');
  });
});
