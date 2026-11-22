import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

export interface XlsxQuerySqlOptions {
  path: string;
  sql: string;
  max_rows?: number; // default 100
}

export interface XlsxQuerySqlResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  tableNames: string[];
}

function sanitizeIdentifier(name: string): string {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9_]/g, '_');
  return cleaned ? (cleaned.match(/^[0-9]/) ? `_${cleaned}` : cleaned) : 'col';
}

function inferSqliteType(values: unknown[]): string {
  let hasInt = false;
  let hasReal = false;
  let hasText = false;
  let hasDate = false;

  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'number') {
      if (Number.isInteger(v)) hasInt = true;
      else hasReal = true;
    } else if (v instanceof Date) {
      hasDate = true;
    } else {
      const s = String(v).trim();
      if (!isNaN(Number(s)) && s !== '') {
        if (s.includes('.')) hasReal = true;
        else hasInt = true;
      } else if (!isNaN(Date.parse(s)) && (s.includes('-') || s.includes('/')) && s.length >= 8) {
        hasDate = true;
      } else {
        hasText = true;
      }
    }
  }

  if (hasText) return 'TEXT';
  if (hasDate) return 'TEXT'; // SQLite stores dates as ISO TEXT
  if (hasReal) return 'REAL';
  if (hasInt) return 'INTEGER';
  return 'TEXT';
}

function formatSqliteValue(v: unknown): unknown {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v.toISOString().split('T')[0]!;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if ('result' in obj && obj.result !== undefined) return formatSqliteValue(obj.result);
    if ('text' in obj && obj.text !== undefined) return String(obj.text);
  }
  const str = String(v).trim();
  const num = Number(str);
  if (!isNaN(num) && str !== '') {
    return num;
  }
  return str;
}

/**
 * Loads sheets from an Excel file into in-memory SQLite tables with type inference,
 * then executes a read-only SQL query.
 */
export async function xlsx_query_sql(options: XlsxQuerySqlOptions): Promise<XlsxQuerySqlResult> {
  const { path: filePath, sql, max_rows = 100 } = options;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Security: enforce read-only SQL
  const trimmedSql = sql.trim();
  const lowerSql = trimmedSql.toLowerCase();
  const forbiddenKeywords = [
    'insert', 'update', 'delete', 'drop', 'alter', 'create',
    'attach', 'detach', 'pragma', 'replace', 'upsert', 'grant', 'revoke'
  ];

  for (const kw of forbiddenKeywords) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(lowerSql)) {
      throw new Error(`Security violation: only read-only SELECT queries are allowed in xlsx_query_sql. Found '${kw}'.`);
    }
  }

  if (!lowerSql.startsWith('select') && !lowerSql.startsWith('with')) {
    throw new Error('Security violation: query must begin with SELECT or WITH');
  }

  // Read workbook
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  // Initialize in-memory SQLite DB
  const db = new DatabaseSync(':memory:');
  const tableNames: string[] = [];

  for (const ws of wb.worksheets) {
    const rawSheetName = ws.name;
    const tableName = sanitizeIdentifier(rawSheetName);
    tableNames.push(tableName);

    if (ws.rowCount === 0) continue;

    // Headers from row 1
    const rawHeaders: string[] = [];
    const headerRow = ws.getRow(1);
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const val = cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : '';
      rawHeaders[colNumber - 1] = val || `col_${colNumber}`;
    });

    const colCount = Math.max(ws.columnCount, rawHeaders.length);
    const headers: string[] = [];
    const usedColNames = new Set<string>();

    for (let c = 0; c < colCount; c++) {
      const baseName = sanitizeIdentifier(rawHeaders[c] || `col_${c + 1}`);
      let colName = baseName;
      let counter = 2;
      while (usedColNames.has(colName.toLowerCase())) {
        colName = `${baseName}_${counter++}`;
      }
      usedColNames.add(colName.toLowerCase());
      headers.push(colName);
    }

    // Collect values per column for type inference
    const colValues: unknown[][] = headers.map(() => []);
    const rowRecords: unknown[][] = [];

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rowVals: unknown[] = [];
      let rowHasData = false;

      for (let c = 0; c < headers.length; c++) {
        const cell = row.getCell(c + 1);
        const val = formatSqliteValue(cell.value);
        if (val !== null) rowHasData = true;
        rowVals.push(val);
        colValues[c]!.push(val);
      }

      if (rowHasData) {
        rowRecords.push(rowVals);
      }
    }

    // Infer column types
    const colTypes = colValues.map((vals) => inferSqliteType(vals));

    // Create table
    const colDefs = headers.map((h, i) => `"${h}" ${colTypes[i]}`).join(', ');
    db.exec(`CREATE TABLE "${tableName}" (${colDefs})`);

    // Insert rows
    if (rowRecords.length > 0) {
      const placeholders = headers.map(() => '?').join(', ');
      const insertStmt = db.prepare(`INSERT INTO "${tableName}" VALUES (${placeholders})`);
      for (const rec of rowRecords) {
        insertStmt.run(...rec);
      }
    }
  }

  // Execute user query
  let queryResult: unknown[];
  try {
    const stmt = db.prepare(trimmedSql);
    queryResult = stmt.all();
  } catch (err) {
    throw new Error(`SQL execution error: ${err instanceof Error ? err.message : String(err)}. Available tables: ${tableNames.join(', ')}`);
  }

  const rowCount = queryResult.length;
  const truncated = rowCount > max_rows;
  const limitedRows = queryResult.slice(0, max_rows);

  const columns: string[] = limitedRows.length > 0 && typeof limitedRows[0] === 'object' && limitedRows[0] !== null
    ? Object.keys(limitedRows[0] as Record<string, unknown>)
    : [];

  const rows = limitedRows.map((r) => {
    const obj = r as Record<string, unknown>;
    return columns.map((col) => obj[col]);
  });

  return {
    columns,
    rows,
    rowCount,
    truncated,
    tableNames,
  };
}
