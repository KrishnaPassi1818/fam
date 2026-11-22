import * as fs from 'node:fs';
import ExcelJS from 'exceljs';

export interface XlsxSheetDescription {
  name: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
  types: Record<string, string>;
  sampleRows: Record<string, unknown>[];
}

export interface XlsxDescribeResult {
  sheetCount: number;
  sheets: XlsxSheetDescription[];
}

export interface XlsxReadRangeOptions {
  path: string;
  sheet?: string;
  range?: string; // e.g. "A1:D50"
  max_rows?: number; // default 200
  format?: 'markdown' | 'csv';
}

export interface XlsxReadRangeResult {
  sheet: string;
  rowCount: number;
  columnCount: number;
  truncated: boolean;
  content: string;
}

function inferType(val: unknown): string {
  if (val === null || val === undefined || val === '') return 'null';
  if (typeof val === 'number') return Number.isInteger(val) ? 'integer' : 'float';
  if (typeof val === 'boolean') return 'boolean';
  if (val instanceof Date) return 'date';
  if (typeof val === 'object' && 'formula' in (val as Record<string, unknown>)) return 'formula';
  const str = String(val).trim();
  if (!isNaN(Number(str)) && str !== '') {
    return str.includes('.') ? 'float' : 'integer';
  }
  if (!isNaN(Date.parse(str)) && (str.includes('-') || str.includes('/')) && str.length >= 8) {
    return 'date';
  }
  return 'string';
}

function cellValueToString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return val.toISOString().split('T')[0]!;
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('result' in obj && obj.result !== undefined) {
      return cellValueToString(obj.result);
    }
    if ('formula' in obj) {
      return `=${obj.formula}`;
    }
    if ('text' in obj) {
      return String(obj.text);
    }
  }
  return String(val);
}

/**
 * Describes an Excel workbook: sheets, dimensions, headers, inferred types, 3 sample rows.
 */
export async function xlsx_describe(filePath: string): Promise<XlsxDescribeResult> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const sheets: XlsxSheetDescription[] = [];

  for (const ws of wb.worksheets) {
    const rowCount = ws.rowCount;
    const colCount = ws.columnCount;
    const headers: string[] = [];
    const types: Record<string, string> = {};
    const sampleRows: Record<string, unknown>[] = [];

    // Header row (row 1)
    const headerRow = ws.getRow(1);
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const headerName = cellValueToString(cell.value).trim() || `Col_${colNumber}`;
      headers[colNumber - 1] = headerName;
    });

    // Fill missing headers
    for (let c = 0; c < colCount; c++) {
      if (!headers[c]) headers[c] = `Col_${c + 1}`;
    }

    // Inspect data rows for types and samples
    const typeCandidates: Record<string, Set<string>> = {};
    for (const h of headers) typeCandidates[h] = new Set();

    let collectedSamples = 0;
    for (let r = 2; r <= Math.min(rowCount, 20); r++) {
      const row = ws.getRow(r);
      const rowData: Record<string, unknown> = {};
      let hasData = false;

      for (let c = 0; c < headers.length; c++) {
        const header = headers[c]!;
        const cell = row.getCell(c + 1);
        const rawVal = cell.value;
        const strVal = cellValueToString(rawVal);
        const t = inferType(rawVal);
        if (t !== 'null') {
          typeCandidates[header]?.add(t);
        }
        rowData[header] = strVal;
        if (strVal !== '') hasData = true;
      }

      if (hasData && collectedSamples < 3) {
        sampleRows.push(rowData);
        collectedSamples++;
      }
    }

    // Resolve inferred types
    for (const h of headers) {
      const candidates = typeCandidates[h];
      if (!candidates || candidates.size === 0) {
        types[h] = 'string';
      } else if (candidates.size === 1) {
        types[h] = candidates.values().next().value!;
      } else if (candidates.has('float') && candidates.has('integer') && candidates.size === 2) {
        types[h] = 'float';
      } else {
        types[h] = 'mixed';
      }
    }

    sheets.push({
      name: ws.name,
      rowCount,
      columnCount: colCount,
      headers,
      types,
      sampleRows,
    });
  }

  return {
    sheetCount: wb.worksheets.length,
    sheets,
  };
}

/**
 * Reads a sheet range formatted as a Markdown table or CSV (bounded to max_rows, default 200).
 */
export async function xlsx_read_range(options: XlsxReadRangeOptions): Promise<XlsxReadRangeResult> {
  const { path: filePath, sheet, range, max_rows = 200, format = 'markdown' } = options;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const ws = sheet ? wb.getWorksheet(sheet) : wb.worksheets[0];
  if (!ws) {
    throw new Error(`Sheet '${sheet || 'default'}' not found in workbook.`);
  }

  let startRow = 1;
  let endRow = ws.rowCount;
  let startCol = 1;
  let endCol = ws.columnCount;

  if (range) {
    // Parse range e.g. "A1:D50" or "B2:C10"
    const match = range.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
    if (match) {
      const colToNum = (colStr: string) => {
        let num = 0;
        for (let i = 0; i < colStr.length; i++) {
          num = num * 26 + (colStr.toUpperCase().charCodeAt(i) - 64);
        }
        return num;
      };
      startCol = colToNum(match[1]!);
      startRow = parseInt(match[2]!, 10);
      if (match[3] && match[4]) {
        endCol = colToNum(match[3]);
        endRow = parseInt(match[4], 10);
      } else {
        endCol = startCol;
        endRow = startRow;
      }
    }
  }

  const totalRows = Math.max(0, endRow - startRow + 1);
  const rowsToRead = Math.min(totalRows, max_rows);
  const truncated = totalRows > max_rows;

  const data: string[][] = [];

  for (let r = 0; r < rowsToRead; r++) {
    const rowIdx = startRow + r;
    const row = ws.getRow(rowIdx);
    const rowVals: string[] = [];
    for (let c = startCol; c <= endCol; c++) {
      const cell = row.getCell(c);
      rowVals.push(cellValueToString(cell.value));
    }
    data.push(rowVals);
  }

  let content = '';

  if (format === 'csv') {
    content = data
      .map((row) =>
        row
          .map((v) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v))
          .join(','),
      )
      .join('\n');
  } else {
    // Markdown table
    if (data.length > 0) {
      const headerRow = data[0]!;
      const headerLine = `| ${headerRow.join(' | ')} |`;
      const separatorLine = `| ${headerRow.map(() => '---').join(' | ')} |`;
      const bodyLines = data.slice(1).map((r) => `| ${r.join(' | ')} |`);
      content = [headerLine, separatorLine, ...bodyLines].join('\n');
    }
  }

  if (truncated) {
    content += `\n\n... [Truncated: showing ${rowsToRead} of ${totalRows} rows]`;
  }

  return {
    sheet: ws.name,
    rowCount: rowsToRead,
    columnCount: Math.max(0, endCol - startCol + 1),
    truncated,
    content,
  };
}
