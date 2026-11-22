import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  docx_read,
  xlsx_describe,
  xlsx_read_range,
  pptx_read,
  pdf_read,
} from './tools/read/index.js';
import { xlsx_query_sql } from './tools/sql/index.js';
import {
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
} from './tools/write/index.js';
import {
  convert,
  recalc,
  render_preview,
  uno_script,
} from './tools/libreoffice/index.js';
import { resolveConfinedPath } from './safety/confinement.js';

export function createOfficeServer(): Server {
  const server = new Server(
    {
      name: 'hx-office',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
    },
  );

  const TOOLS = [
    // --- READ TOOLS (TIER 0) ---
    {
      name: 'docx_read',
      description: 'Reads a .docx document, returning markdown with a heading outline and bounded text.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to .docx file' },
          section: { type: 'string', description: 'Optional heading name to filter content to that section' },
          max_chars: { type: 'number', description: 'Max characters to return (default 8000)' },
        },
        required: ['path'],
      },
      annotations: { readOnlyHint: true },
      category: 'office',
    },
    {
      name: 'xlsx_describe',
      description: 'Describes an Excel workbook: sheets, dimensions, headers, inferred types, and 3 sample rows.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to .xlsx file' },
        },
        required: ['path'],
      },
      annotations: { readOnlyHint: true },
      category: 'office',
    },
    {
      name: 'xlsx_read_range',
      description: 'Reads an Excel sheet range as Markdown table or CSV, bounded to max_rows (default 200).',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to .xlsx file' },
          sheet: { type: 'string', description: 'Sheet name (defaults to first sheet)' },
          range: { type: 'string', description: 'Cell range e.g. "A1:D50"' },
          max_rows: { type: 'number', description: 'Max rows to read (default 200)' },
          format: { type: 'string', enum: ['markdown', 'csv'], description: 'Output format (default markdown)' },
        },
        required: ['path'],
      },
      annotations: { readOnlyHint: true },
      category: 'office',
    },
    {
      name: 'pptx_read',
      description: 'Reads a PowerPoint (.pptx) presentation: slide count, titles, bullet points, and speaker notes.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to .pptx file' },
          max_slides: { type: 'number', description: 'Max slides to read (default 50)' },
        },
        required: ['path'],
      },
      annotations: { readOnlyHint: true },
      category: 'office',
    },
    {
      name: 'pdf_read',
      description: 'Reads a PDF document, extracting page-bounded text using pdftotext / pdf-parse.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to .pdf file' },
          pages: { type: 'string', description: 'Page range e.g. "1-5", "2", or "all"' },
          max_chars: { type: 'number', description: 'Max characters to extract (default 8000)' },
        },
        required: ['path'],
      },
      annotations: { readOnlyHint: true },
      category: 'office',
    },
    {
      name: 'xlsx_query_sql',
      description: 'Executes a read-only SQL SELECT query against an Excel spreadsheet using in-memory SQLite tables with automatic type inference.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to .xlsx file' },
          sql: { type: 'string', description: 'Read-only SQL query (must begin with SELECT or WITH)' },
          max_rows: { type: 'number', description: 'Max result rows (default 100)' },
        },
        required: ['path', 'sql'],
      },
      annotations: { readOnlyHint: true },
      category: 'office',
    },
    {
      name: 'render_preview',
      description: 'Renders pages of a document (.pdf, .docx, .pptx, .xlsx) to PNG images for preview inspection.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to document' },
          pages: { type: 'string', description: 'Pages to render (e.g. "1-3", "1", default "1")' },
          outdir: { type: 'string', description: 'Output directory for generated images' },
          dpi: { type: 'number', description: 'Resolution DPI (default 150)' },
        },
        required: ['path'],
      },
      annotations: { readOnlyHint: true },
      category: 'office',
    },

    // --- WRITE TOOLS (TIER 1) ---
    {
      name: 'xlsx_write_cells',
      description: 'Updates specific cells in an Excel file while preserving existing styles and formatting.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to .xlsx file' },
          sheet: { type: 'string', description: 'Sheet name' },
          cells: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                cell: { type: 'string', description: 'Cell address e.g. "B5"' },
                value: { description: 'Cell value' },
              },
              required: ['cell', 'value'],
            },
            description: 'Array of cell updates',
          },
        },
        required: ['path', 'cells'],
      },
      annotations: { destructiveHint: false },
      category: 'office',
    },
    {
      name: 'xlsx_add_formula',
      description: 'Adds or updates a formula in a specific cell in an Excel workbook.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to .xlsx file' },
          sheet: { type: 'string', description: 'Sheet name' },
          cell: { type: 'string', description: 'Cell address e.g. "D10"' },
          formula: { type: 'string', description: 'Formula expression e.g. "=SUM(D2:D9)"' },
        },
        required: ['path', 'cell', 'formula'],
      },
      annotations: { destructiveHint: false },
      category: 'office',
    },
    {
      name: 'xlsx_add_sheet',
      description: 'Adds a new sheet to an Excel workbook with optional initial data.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to .xlsx file' },
          sheetName: { type: 'string', description: 'Name of the new sheet' },
          data: {
            type: 'array',
            items: { type: 'array' },
            description: '2D array of initial rows',
          },
        },
        required: ['path', 'sheetName'],
      },
      annotations: { destructiveHint: false },
      category: 'office',
    },
    {
      name: 'xlsx_create_from_csv',
      description: 'Creates a well-formatted .xlsx workbook from an existing CSV file.',
      inputSchema: {
        type: 'object',
        properties: {
          csvPath: { type: 'string', description: 'Path to source CSV file' },
          xlsxPath: { type: 'string', description: 'Path to destination .xlsx file' },
          sheetName: { type: 'string', description: 'Sheet name (default "Data")' },
        },
        required: ['csvPath', 'xlsxPath'],
      },
      annotations: { destructiveHint: false },
      category: 'office',
    },
    {
      name: 'docx_replace_text',
      description: 'Replaces text across a .docx file safely across fragmented OpenXML text runs.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to .docx file' },
          search: { type: 'string', description: 'Text to search for' },
          replace: { type: 'string', description: 'Replacement text' },
        },
        required: ['path', 'search', 'replace'],
      },
      annotations: { destructiveHint: false },
      category: 'office',
    },
    {
      name: 'docx_insert_paragraph',
      description: 'Inserts a paragraph or heading into an existing .docx file (optionally after a heading).',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to .docx file' },
          text: { type: 'string', description: 'Paragraph text to insert' },
          after_heading: { type: 'string', description: 'Optional heading name after which to insert' },
          headingLevel: { type: 'number', description: 'Optional heading level 1-6' },
        },
        required: ['path', 'text'],
      },
      annotations: { destructiveHint: false },
      category: 'office',
    },
    {
      name: 'docx_add_table',
      description: 'Inserts a formatted table into an existing .docx file.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to .docx file' },
          data: {
            type: 'array',
            items: { type: 'array', items: { type: 'string' } },
            description: '2D array of table data',
          },
          headers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional column headers',
          },
        },
        required: ['path', 'data'],
      },
      annotations: { destructiveHint: false },
      category: 'office',
    },
    {
      name: 'docx_create_from_markdown',
      description: 'Creates a clean, styled .docx document from a Markdown file.',
      inputSchema: {
        type: 'object',
        properties: {
          mdPath: { type: 'string', description: 'Path to source Markdown file' },
          docxPath: { type: 'string', description: 'Path to destination .docx file' },
          title: { type: 'string', description: 'Optional document title' },
        },
        required: ['mdPath', 'docxPath'],
      },
      annotations: { destructiveHint: false },
      category: 'office',
    },
    {
      name: 'docx_apply_template',
      description: 'Replaces {{placeholder}} tokens across a template DOCX file and saves to outputPath.',
      inputSchema: {
        type: 'object',
        properties: {
          templatePath: { type: 'string', description: 'Path to template .docx' },
          data: { type: 'object', description: 'Key-value map of placeholder replacements' },
          outputPath: { type: 'string', description: 'Path to output .docx file' },
        },
        required: ['templatePath', 'data', 'outputPath'],
      },
      annotations: { destructiveHint: false },
      category: 'office',
    },
    {
      name: 'pptx_create',
      description: 'Creates a new PowerPoint presentation (.pptx) with a styled title slide.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to destination .pptx file' },
          title: { type: 'string', description: 'Presentation title' },
          subtitle: { type: 'string', description: 'Optional presentation subtitle' },
          author: { type: 'string', description: 'Optional author name' },
        },
        required: ['path', 'title'],
      },
      annotations: { destructiveHint: false },
      category: 'office',
    },
    {
      name: 'pptx_add_slide',
      description: 'Adds a content slide with title, bullet points, and speaker notes to a .pptx file.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to .pptx file' },
          title: { type: 'string', description: 'Slide title' },
          bullets: {
            type: 'array',
            items: { type: 'string' },
            description: 'Bullet points',
          },
          notes: { type: 'string', description: 'Speaker notes' },
        },
        required: ['path', 'title', 'bullets'],
      },
      annotations: { destructiveHint: false },
      category: 'office',
    },
    {
      name: 'convert',
      description: 'Converts documents between formats (.docx, .doc, .xlsx, .xls, .pptx, .ppt, .odt, .ods, .pdf) using headless LibreOffice.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to source document' },
          to: { type: 'string', description: 'Target format extension (e.g. "pdf", "docx", "xlsx")' },
          outdir: { type: 'string', description: 'Output directory' },
        },
        required: ['path', 'to'],
      },
      annotations: { destructiveHint: false },
      category: 'office',
    },
    {
      name: 'recalc',
      description: 'Forces recalculation and caching of all spreadsheet formula values via headless LibreOffice.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to spreadsheet (.xlsx or .ods)' },
        },
        required: ['path'],
      },
      annotations: { destructiveHint: false },
      category: 'office',
    },

    // --- FALLBACK UNO SCRIPT (TIER 3) ---
    {
      name: 'uno_script',
      description: 'Executes a Python LibreOffice UNO automation script for specialized operations not covered by standard tools (Tier 3).',
      inputSchema: {
        type: 'object',
        properties: {
          scriptPath: { type: 'string', description: 'Path to Python UNO script' },
          code: { type: 'string', description: 'Inline Python UNO script code' },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Arguments to pass to the script',
          },
        },
      },
      annotations: { openWorldHint: true },
      category: 'office',
    },
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOLS,
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs = {} } = request.params;
    const args = rawArgs as Record<string, unknown>;

    try {
      // Confine path arguments
      const pathKeys = ['path', 'csvPath', 'xlsxPath', 'mdPath', 'docxPath', 'templatePath', 'outputPath', 'scriptPath'];
      for (const pk of pathKeys) {
        if (typeof args[pk] === 'string') {
          const { resolvedPath } = resolveConfinedPath(args[pk] as string);
          args[pk] = resolvedPath;
        }
      }

      let result: unknown;

      switch (name) {
        case 'docx_read':
          result = await docx_read(args as unknown as Parameters<typeof docx_read>[0]);
          break;
        case 'xlsx_describe':
          result = await xlsx_describe(args.path as string);
          break;
        case 'xlsx_read_range':
          result = await xlsx_read_range(args as unknown as Parameters<typeof xlsx_read_range>[0]);
          break;
        case 'pptx_read':
          result = await pptx_read(args.path as string, args.max_slides as number | undefined);
          break;
        case 'pdf_read':
          result = await pdf_read(args as unknown as Parameters<typeof pdf_read>[0]);
          break;
        case 'xlsx_query_sql':
          result = await xlsx_query_sql(args as unknown as Parameters<typeof xlsx_query_sql>[0]);
          break;
        case 'render_preview':
          result = await render_preview(args as unknown as Parameters<typeof render_preview>[0]);
          break;
        case 'xlsx_write_cells':
          result = await xlsx_write_cells(args as unknown as Parameters<typeof xlsx_write_cells>[0]);
          break;
        case 'xlsx_add_formula':
          result = await xlsx_add_formula(args as unknown as Parameters<typeof xlsx_add_formula>[0]);
          break;
        case 'xlsx_add_sheet':
          result = await xlsx_add_sheet(args as unknown as Parameters<typeof xlsx_add_sheet>[0]);
          break;
        case 'xlsx_create_from_csv':
          result = await xlsx_create_from_csv(args as unknown as Parameters<typeof xlsx_create_from_csv>[0]);
          break;
        case 'docx_replace_text':
          result = await docx_replace_text(args as unknown as Parameters<typeof docx_replace_text>[0]);
          break;
        case 'docx_insert_paragraph':
          result = await docx_insert_paragraph(args as unknown as Parameters<typeof docx_insert_paragraph>[0]);
          break;
        case 'docx_add_table':
          result = await docx_add_table(args as unknown as Parameters<typeof docx_add_table>[0]);
          break;
        case 'docx_create_from_markdown':
          result = await docx_create_from_markdown(args as unknown as Parameters<typeof docx_create_from_markdown>[0]);
          break;
        case 'docx_apply_template':
          result = await docx_apply_template(args as unknown as Parameters<typeof docx_apply_template>[0]);
          break;
        case 'pptx_create':
          result = await pptx_create(args as unknown as Parameters<typeof pptx_create>[0]);
          break;
        case 'pptx_add_slide':
          result = await pptx_add_slide(args as unknown as Parameters<typeof pptx_add_slide>[0]);
          break;
        case 'convert':
          result = await convert(args as unknown as Parameters<typeof convert>[0]);
          break;
        case 'recalc':
          result = await recalc(args as unknown as Parameters<typeof recalc>[0]);
          break;
        case 'uno_script':
          result = await uno_script(args as unknown as Parameters<typeof uno_script>[0]);
          break;
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: false,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      };
    }
  });

  return server;
}

export async function runServer(): Promise<void> {
  const server = createOfficeServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
