import * as fs from 'node:fs';
import ExcelJS from 'exceljs';
import { withWorkingCopy } from '../../safety/working-copy.js';

export interface CellUpdate {
  cell: string; // e.g. "B5"
  value: unknown;
}

export interface XlsxWriteCellsOptions {
  path: string;
  sheet?: string;
  cells: CellUpdate[];
}

export interface XlsxAddFormulaOptions {
  path: string;
  sheet?: string;
  cell: string;
  formula: string; // e.g. "=SUM(B2:B10)" or "SUM(B2:B10)"
}

export interface XlsxAddSheetOptions {
  path: string;
  sheetName: string;
  data?: unknown[][];
}

export interface XlsxCreateFromCsvOptions {
  csvPath: string;
  xlsxPath: string;
  sheetName?: string;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Updates specific cells in an Excel file while preserving existing styles and formatting.
 */
export async function xlsx_write_cells(options: XlsxWriteCellsOptions) {
  const { path: filePath, sheet, cells } = options;

  return await withWorkingCopy(
    filePath,
    'xlsx',
    `updated ${cells.length} cells in sheet '${sheet || 'default'}'`,
    async (workingPath) => {
      const wb = new ExcelJS.Workbook();
      if (fs.existsSync(workingPath)) {
        await wb.xlsx.readFile(workingPath);
      }

      let ws = sheet ? wb.getWorksheet(sheet) : wb.worksheets[0];
      if (!ws) {
        ws = wb.addWorksheet(sheet || 'Sheet1');
      }

      for (const { cell: cellAddr, value } of cells) {
        const c = ws.getCell(cellAddr);
        if (typeof value === 'string' && value.startsWith('=')) {
          c.value = { formula: value.slice(1) };
        } else {
          c.value = value as ExcelJS.CellValue;
        }
      }

      await wb.xlsx.writeFile(workingPath);
      return { updatedCount: cells.length };
    },
  );
}

/**
 * Adds or updates a formula in a specific cell in an Excel file.
 */
export async function xlsx_add_formula(options: XlsxAddFormulaOptions) {
  const { path: filePath, sheet, cell: cellAddr, formula } = options;
  const cleanFormula = formula.startsWith('=') ? formula.slice(1) : formula;

  return await withWorkingCopy(
    filePath,
    'xlsx',
    `set formula '${cleanFormula}' in cell ${cellAddr}`,
    async (workingPath) => {
      const wb = new ExcelJS.Workbook();
      if (fs.existsSync(workingPath)) {
        await wb.xlsx.readFile(workingPath);
      }

      let ws = sheet ? wb.getWorksheet(sheet) : wb.worksheets[0];
      if (!ws) {
        ws = wb.addWorksheet(sheet || 'Sheet1');
      }

      const c = ws.getCell(cellAddr);
      c.value = { formula: cleanFormula };

      await wb.xlsx.writeFile(workingPath);
      return { cell: cellAddr, formula: cleanFormula };
    },
  );
}

/**
 * Adds a new sheet to an Excel workbook with optional initial data.
 */
export async function xlsx_add_sheet(options: XlsxAddSheetOptions) {
  const { path: filePath, sheetName, data } = options;

  return await withWorkingCopy(
    filePath,
    'xlsx',
    `added sheet '${sheetName}'`,
    async (workingPath) => {
      const wb = new ExcelJS.Workbook();
      if (fs.existsSync(workingPath)) {
        await wb.xlsx.readFile(workingPath);
      }

      const existing = wb.getWorksheet(sheetName);
      if (existing) {
        throw new Error(`Sheet '${sheetName}' already exists in workbook.`);
      }

      const ws = wb.addWorksheet(sheetName);

      if (data && Array.isArray(data)) {
        for (const row of data) {
          ws.addRow(row);
        }
      }

      await wb.xlsx.writeFile(workingPath);
      return { sheetName, rowCount: data ? data.length : 0 };
    },
  );
}

/**
 * Creates a well-formatted .xlsx file from a CSV file.
 */
export async function xlsx_create_from_csv(options: XlsxCreateFromCsvOptions) {
  const { csvPath, xlsxPath, sheetName = 'Data' } = options;

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

  return await withWorkingCopy(
    xlsxPath,
    'xlsx',
    `created from CSV '${csvPath}' (${lines.length} rows)`,
    async (workingPath) => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(sheetName);

      for (let i = 0; i < lines.length; i++) {
        const rowVals = parseCsvLine(lines[i]!);
        const typedRowVals = rowVals.map((val) => {
          if (val === '') return null;
          const num = Number(val);
          if (!isNaN(num)) return num;
          if (val.toLowerCase() === 'true') return true;
          if (val.toLowerCase() === 'false') return false;
          return val;
        });
        const row = ws.addRow(typedRowVals);

        // Header formatting for first row
        if (i === 0) {
          row.font = { bold: true };
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFEFEFEF' },
          };
        }
      }

      await wb.xlsx.writeFile(workingPath);
      return { sheetName, rowCount: lines.length };
    },
  );
}
