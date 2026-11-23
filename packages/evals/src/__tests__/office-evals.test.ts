import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { loadAllTasks, EvalRunner, type TaskDefinition } from '../index.js';
import type { ModelAdapter, ChatChunk, ToolDescriptor } from '@fam/shared';
import type { ToolExecutionHandler } from '@fam/core';

import {
  docx_read,
  xlsx_describe,
  xlsx_read_range,
  pptx_read,
  pdf_read,
  xlsx_query_sql,
  xlsx_write_cells,
  xlsx_add_formula,
  xlsx_add_sheet,
  xlsx_create_from_csv,
  docx_replace_text,
  docx_insert_paragraph,
  docx_add_table,
  docx_create_from_markdown,
  docx_apply_template,
  pptx_create,
  pptx_add_slide,
  convert,
  recalc,
  render_preview,
  uno_script,
} from '@fam/office';

describe('Office Evaluation Suite (T7.9)', () => {
  const allTasks = loadAllTasks();
  const officeTasks = allTasks.filter((t) => t.suite === 'office');

  it('loads all 10 office evaluation tasks', () => {
    expect(officeTasks.length).toBeGreaterThanOrEqual(10);
    const ids = officeTasks.map((t) => t.id);
    expect(ids).toContain('task_06_office_docx_read');
    expect(ids).toContain('task_07_office_docx_create_markdown');
    expect(ids).toContain('task_08_office_docx_replace_text');
    expect(ids).toContain('task_09_office_docx_add_table');
    expect(ids).toContain('task_10_office_xlsx_describe');
    expect(ids).toContain('task_11_office_xlsx_create_csv');
    expect(ids).toContain('task_12_office_xlsx_query_sql');
    expect(ids).toContain('task_13_office_xlsx_write_formula');
    expect(ids).toContain('task_14_office_pptx_create');
    expect(ids).toContain('task_15_office_libreoffice_convert');
  });

  const officeToolDescriptors: ToolDescriptor[] = [
    {
      name: 'docx_read',
      alias: 'docx_read',
      description: 'Read docx',
      inputSchema: { type: 'object' },
      annotations: { readOnlyHint: true },
      category: 'office',
      tier: 0,
      timeoutMs: 30000,
    },
    {
      name: 'docx_create_from_markdown',
      alias: 'docx_create_from_markdown',
      description: 'Create docx from markdown',
      inputSchema: { type: 'object' },
      annotations: { destructiveHint: false },
      category: 'office',
      tier: 1,
      timeoutMs: 30000,
    },
    {
      name: 'docx_replace_text',
      alias: 'docx_replace_text',
      description: 'Replace text in docx',
      inputSchema: { type: 'object' },
      annotations: { destructiveHint: false },
      category: 'office',
      tier: 1,
      timeoutMs: 30000,
    },
    {
      name: 'docx_add_table',
      alias: 'docx_add_table',
      description: 'Add table to docx',
      inputSchema: { type: 'object' },
      annotations: { destructiveHint: false },
      category: 'office',
      tier: 1,
      timeoutMs: 30000,
    },
    {
      name: 'xlsx_describe',
      alias: 'xlsx_describe',
      description: 'Describe xlsx',
      inputSchema: { type: 'object' },
      annotations: { readOnlyHint: true },
      category: 'office',
      tier: 0,
      timeoutMs: 30000,
    },
    {
      name: 'xlsx_create_from_csv',
      alias: 'xlsx_create_from_csv',
      description: 'Create xlsx from csv',
      inputSchema: { type: 'object' },
      annotations: { destructiveHint: false },
      category: 'office',
      tier: 1,
      timeoutMs: 30000,
    },
    {
      name: 'xlsx_query_sql',
      alias: 'xlsx_query_sql',
      description: 'Query xlsx via SQL',
      inputSchema: { type: 'object' },
      annotations: { readOnlyHint: true },
      category: 'office',
      tier: 0,
      timeoutMs: 30000,
    },
    {
      name: 'xlsx_add_formula',
      alias: 'xlsx_add_formula',
      description: 'Add formula to xlsx',
      inputSchema: { type: 'object' },
      annotations: { destructiveHint: false },
      category: 'office',
      tier: 1,
      timeoutMs: 30000,
    },
    {
      name: 'pptx_create',
      alias: 'pptx_create',
      description: 'Create pptx',
      inputSchema: { type: 'object' },
      annotations: { destructiveHint: false },
      category: 'office',
      tier: 1,
      timeoutMs: 30000,
    },
    {
      name: 'convert',
      alias: 'convert',
      description: 'Convert doc via LibreOffice',
      inputSchema: { type: 'object' },
      annotations: { destructiveHint: false },
      category: 'office',
      tier: 1,
      timeoutMs: 40000,
    },
  ];

  const officeToolHandlers: Record<string, ToolExecutionHandler> = {
    docx_read: async (args) => ({ content: JSON.stringify(await docx_read(args as unknown as Parameters<typeof docx_read>[0])) }),
    xlsx_describe: async (args) => ({ content: JSON.stringify(await xlsx_describe(String(args['path']))) }),
    xlsx_read_range: async (args) => ({ content: JSON.stringify(await xlsx_read_range(args as unknown as Parameters<typeof xlsx_read_range>[0])) }),
    pptx_read: async (args) => ({ content: JSON.stringify(await pptx_read(String(args['path']))) }),
    pdf_read: async (args) => ({ content: JSON.stringify(await pdf_read(args as unknown as Parameters<typeof pdf_read>[0])) }),
    xlsx_query_sql: async (args) => ({ content: JSON.stringify(await xlsx_query_sql(args as unknown as Parameters<typeof xlsx_query_sql>[0])) }),
    xlsx_write_cells: async (args) => ({ content: JSON.stringify(await xlsx_write_cells(args as unknown as Parameters<typeof xlsx_write_cells>[0])) }),
    xlsx_add_formula: async (args) => ({ content: JSON.stringify(await xlsx_add_formula(args as unknown as Parameters<typeof xlsx_add_formula>[0])) }),
    xlsx_add_sheet: async (args) => ({ content: JSON.stringify(await xlsx_add_sheet(args as unknown as Parameters<typeof xlsx_add_sheet>[0])) }),
    xlsx_create_from_csv: async (args) => ({ content: JSON.stringify(await xlsx_create_from_csv(args as unknown as Parameters<typeof xlsx_create_from_csv>[0])) }),
    docx_replace_text: async (args) => ({ content: JSON.stringify(await docx_replace_text(args as unknown as Parameters<typeof docx_replace_text>[0])) }),
    docx_insert_paragraph: async (args) => ({ content: JSON.stringify(await docx_insert_paragraph(args as unknown as Parameters<typeof docx_insert_paragraph>[0])) }),
    docx_add_table: async (args) => ({ content: JSON.stringify(await docx_add_table(args as unknown as Parameters<typeof docx_add_table>[0])) }),
    docx_create_from_markdown: async (args) => ({ content: JSON.stringify(await docx_create_from_markdown(args as unknown as Parameters<typeof docx_create_from_markdown>[0])) }),
    docx_apply_template: async (args) => ({ content: JSON.stringify(await docx_apply_template(args as unknown as Parameters<typeof docx_apply_template>[0])) }),
    pptx_create: async (args) => ({ content: JSON.stringify(await pptx_create(args as unknown as Parameters<typeof pptx_create>[0])) }),
    pptx_add_slide: async (args) => ({ content: JSON.stringify(await pptx_add_slide(args as unknown as Parameters<typeof pptx_add_slide>[0])) }),
    convert: async (args) => ({ content: JSON.stringify(await convert(args as unknown as Parameters<typeof convert>[0])) }),
    recalc: async (args) => ({ content: JSON.stringify(await recalc(args as unknown as Parameters<typeof recalc>[0])) }),
    render_preview: async (args) => ({ content: JSON.stringify(await render_preview(args as unknown as Parameters<typeof render_preview>[0])) }),
    uno_script: async (args) => ({ content: JSON.stringify(await uno_script(args as unknown as Parameters<typeof uno_script>[0])) }),
  };

  it('executes all 10 office eval cases with 100% pass and LibreOffice headless verification', async () => {
    const runner = new EvalRunner();

    for (const task of officeTasks) {
      // Create a scripted adapter tailored to the specific task prompt
      let turn = 0;
      const taskAdapter: ModelAdapter = {
        id: 'mock:office-eval-agent',
        caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 8192 },
        async *chat(): AsyncIterable<ChatChunk> {
          turn++;
          if (turn === 1) {
            switch (task.id) {
              case 'task_06_office_docx_read':
                yield {
                  delta: 'Reading document...',
                  toolCalls: [{ id: 'c1', name: 'docx_read', args: { path: 'report.docx', section: 'Architecture' } }],
                };
                break;
              case 'task_07_office_docx_create_markdown':
                yield {
                  delta: 'Creating docx from markdown...',
                  toolCalls: [{ id: 'c2', name: 'docx_create_from_markdown', args: { mdPath: 'proposal.md', docxPath: 'proposal.docx' } }],
                };
                break;
              case 'task_08_office_docx_replace_text':
                yield {
                  delta: 'Replacing text in agreement...',
                  toolCalls: [{ id: 'c3', name: 'docx_replace_text', args: { path: 'agreement.docx', search: 'Alpha Corp', replace: 'Beta Technologies' } }],
                };
                break;
              case 'task_09_office_docx_add_table':
                yield {
                  delta: 'Adding table to summary...',
                  toolCalls: [{ id: 'c4', name: 'docx_add_table', args: { path: 'summary.docx', headers: ['Metric', 'Value'], data: [['Q1 Revenue', '$10M']] } }],
                };
                break;
              case 'task_10_office_xlsx_describe':
                yield {
                  delta: 'Describing spreadsheet...',
                  toolCalls: [{ id: 'c5', name: 'xlsx_describe', args: { path: 'financials.xlsx' } }],
                };
                break;
              case 'task_11_office_xlsx_create_csv':
                yield {
                  delta: 'Converting CSV to Excel...',
                  toolCalls: [{ id: 'c6', name: 'xlsx_create_from_csv', args: { csvPath: 'customers.csv', xlsxPath: 'customers.xlsx' } }],
                };
                break;
              case 'task_12_office_xlsx_query_sql':
                yield {
                  delta: 'Querying metrics via SQL...',
                  toolCalls: [{ id: 'c7', name: 'xlsx_query_sql', args: { path: 'metrics.xlsx', sql: 'SELECT Category, SUM(Spend) as total FROM Sheet1 GROUP BY Category' } }],
                };
                break;
              case 'task_13_office_xlsx_write_formula':
                yield {
                  delta: 'Adding formula to budget...',
                  toolCalls: [{ id: 'c8', name: 'xlsx_add_formula', args: { path: 'budget.xlsx', cell: 'B4', formula: '=SUM(B2:B3)' } }],
                };
                break;
              case 'task_14_office_pptx_create':
                yield {
                  delta: 'Creating presentation...',
                  toolCalls: [{ id: 'c9', name: 'pptx_create', args: { path: 'pitch.pptx', title: 'AI Agent Harness' } }],
                };
                break;
              case 'task_15_office_libreoffice_convert':
                yield {
                  delta: 'Converting notes.docx to PDF...',
                  toolCalls: [{ id: 'c10', name: 'convert', args: { path: 'notes.docx', to: 'pdf' } }],
                };
                break;
            }
          } else {
            yield { delta: 'Task completed successfully.' };
          }
        },
        countTokens: () => 20,
      };

      // Set up fixtures on disk for tasks that need existing binary files
      const enrichedTask: TaskDefinition = {
        ...task,
        fixtures: { ...(task.fixtures || {}) },
      };

      // Pre-create initial valid documents if the task operates on an existing file
      if (task.id === 'task_06_office_docx_read') {
        const mdPath = '/tmp/report_fixture.md';
        fs.writeFileSync(mdPath, '# Executive Summary\n\n## Architecture\nMicroservices with event sourcing.\n', 'utf-8');
        await docx_create_from_markdown({ mdPath, docxPath: '/tmp/report.docx' });
        enrichedTask.fixtures!['report.docx'] = fs.readFileSync('/tmp/report.docx').toString('binary');
      } else if (task.id === 'task_08_office_docx_replace_text') {
        const mdPath = '/tmp/agr_fixture.md';
        fs.writeFileSync(mdPath, '# Agreement\n\nParties: Alpha Corp and Client.\n', 'utf-8');
        await docx_create_from_markdown({ mdPath, docxPath: '/tmp/agreement.docx' });
        enrichedTask.fixtures!['agreement.docx'] = fs.readFileSync('/tmp/agreement.docx').toString('binary');
      } else if (task.id === 'task_09_office_docx_add_table') {
        const mdPath = '/tmp/sum_fixture.md';
        fs.writeFileSync(mdPath, '# Summary Report\n\nPerformance metrics below:\n', 'utf-8');
        await docx_create_from_markdown({ mdPath, docxPath: '/tmp/summary.docx' });
        enrichedTask.fixtures!['summary.docx'] = fs.readFileSync('/tmp/summary.docx').toString('binary');
      } else if (task.id === 'task_10_office_xlsx_describe') {
        const csvPath = '/tmp/fin_fixture.csv';
        fs.writeFileSync(csvPath, 'Quarter,Revenue,Expenses\nQ1,500,300\nQ2,600,350\n', 'utf-8');
        await xlsx_create_from_csv({ csvPath, xlsxPath: '/tmp/financials.xlsx' });
        enrichedTask.fixtures!['financials.xlsx'] = fs.readFileSync('/tmp/financials.xlsx').toString('binary');
      } else if (task.id === 'task_12_office_xlsx_query_sql') {
        const csvPath = '/tmp/met_fixture.csv';
        fs.writeFileSync(csvPath, 'Category,Spend\nCloud,1200\nHardware,800\nCloud,400\n', 'utf-8');
        await xlsx_create_from_csv({ csvPath, xlsxPath: '/tmp/metrics.xlsx', sheetName: 'Sheet1' });
        enrichedTask.fixtures!['metrics.xlsx'] = fs.readFileSync('/tmp/metrics.xlsx').toString('binary');
      } else if (task.id === 'task_13_office_xlsx_write_formula') {
        const csvPath = '/tmp/bud_fixture.csv';
        fs.writeFileSync(csvPath, 'Item,Cost\nServers,5000\nBandwidth,2000\nTotal,0\n', 'utf-8');
        await xlsx_create_from_csv({ csvPath, xlsxPath: '/tmp/budget.xlsx' });
        enrichedTask.fixtures!['budget.xlsx'] = fs.readFileSync('/tmp/budget.xlsx').toString('binary');
      } else if (task.id === 'task_15_office_libreoffice_convert') {
        const mdPath = '/tmp/notes_fixture.md';
        fs.writeFileSync(mdPath, '# Meeting Notes\n\nAction items for team.\n', 'utf-8');
        await docx_create_from_markdown({ mdPath, docxPath: '/tmp/notes.docx' });
        enrichedTask.fixtures!['notes.docx'] = fs.readFileSync('/tmp/notes.docx').toString('binary');
      }

      const runResult = await runner.runTask(
        enrichedTask,
        taskAdapter,
        officeToolDescriptors,
        officeToolHandlers,
      );

      expect(
        runResult.passed,
        `Task ${task.id} failed checks: ${JSON.stringify(runResult.checkResults.filter((c) => !c.passed))}`,
      ).toBe(true);
    }
  }, 120000);
});
