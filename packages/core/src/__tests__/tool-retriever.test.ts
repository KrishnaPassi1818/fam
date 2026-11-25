import { describe, it, expect, beforeEach } from 'vitest';
import type { ToolDescriptor } from '@fam/shared';
import { ToolRetriever } from '../tools/retriever.js';
import { EmbeddingService } from '../tools/embedding.js';
import { handleFindTools } from '../tools/meta/find-tools.js';

// Fixture tools across categories
const FIXTURE_TOOLS: ToolDescriptor[] = [
  {
    name: 'fs.read_file',
    alias: 'fs_read_file',
    description: 'Read the text contents of a file within the workspace with line range support.',
    shortDescription: 'Read file contents with ranges.',
    category: 'fs',
    tier: 0,
    timeoutMs: 5000,
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'fs.write_file',
    alias: 'fs_write_file',
    description: 'Write entire content to a file, creating parent directories if needed.',
    shortDescription: 'Write entire file content.',
    category: 'fs',
    tier: 1,
    timeoutMs: 5000,
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
    annotations: { destructiveHint: true },
  },
  {
    name: 'fs.apply_edit',
    alias: 'fs_apply_edit',
    description: 'Apply search and replace block edits to a file safely.',
    shortDescription: 'Apply search and replace edits.',
    category: 'fs',
    tier: 1,
    timeoutMs: 5000,
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, edits: { type: 'array' } }, required: ['path', 'edits'] },
    annotations: {},
  },
  {
    name: 'fs.grep',
    alias: 'fs_grep',
    description: 'Search for regex patterns across files respecting gitignore rules.',
    shortDescription: 'Search files with regex.',
    category: 'fs',
    tier: 0,
    timeoutMs: 10000,
    inputSchema: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'fs.trash',
    alias: 'fs_trash',
    description: 'Move a file or directory safely to the operating system trash bin.',
    shortDescription: 'Trash a file or folder.',
    category: 'fs',
    tier: 2,
    timeoutMs: 5000,
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    annotations: { destructiveHint: true },
  },
  {
    name: 'git.status',
    alias: 'git_status',
    description: 'Inspect the current git working tree status and branch state.',
    shortDescription: 'Check git status.',
    category: 'git',
    tier: 0,
    timeoutMs: 5000,
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'office.xlsx_read_range',
    alias: 'office_xlsx_read_range',
    description: 'Read a specific range of cells from an Excel spreadsheet sheet.',
    shortDescription: 'Read Excel cell range.',
    category: 'office',
    tier: 0,
    timeoutMs: 5000,
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, range: { type: 'string' } }, required: ['path'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'office.docx_replace_text',
    alias: 'office_docx_replace_text',
    description: 'Find and replace text runs within a Word docx document preserving styles.',
    shortDescription: 'Replace Word text.',
    category: 'office',
    tier: 1,
    timeoutMs: 5000,
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, search: { type: 'string' }, replace: { type: 'string' } }, required: ['path', 'search', 'replace'] },
    annotations: {},
  },
  {
    name: 'web.search',
    alias: 'web_search',
    description: 'Execute a web search query and return ranked markdown summaries and citations.',
    shortDescription: 'Search the web.',
    category: 'web',
    tier: 0,
    timeoutMs: 10000,
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'system.clipboard_read',
    alias: 'sys_clipboard_read',
    description: 'Read the current text contents from the operating system clipboard.',
    shortDescription: 'Read clipboard text.',
    category: 'system',
    tier: 0,
    timeoutMs: 3000,
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'core.blob_read',
    alias: 'blob_read',
    description: 'Read lines from a previously offloaded tool result blob handle.',
    shortDescription: 'Read offloaded blob.',
    category: 'core',
    tier: 0,
    timeoutMs: 5000,
    inputSchema: { type: 'object', properties: { handle: { type: 'string' } }, required: ['handle'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'core.find_tools',
    alias: 'find_tools',
    description: 'Search the harness tool registry for additional tools and activate them.',
    shortDescription: 'Discover and activate tools.',
    category: 'core',
    tier: 0,
    timeoutMs: 5000,
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    annotations: { readOnlyHint: true },
  },
];

describe('Phase 5: Tool Embeddings & Vector Retrieval (T5.3, T5.4, T5.5)', () => {
  let embeddingService: EmbeddingService;
  let retriever: ToolRetriever;

  beforeEach(() => {
    embeddingService = new EmbeddingService();
    retriever = new ToolRetriever({ embeddingService });
    for (const tool of FIXTURE_TOOLS) {
      retriever.registerTool(tool);
    }
  });

  it('embeds tools and caches embeddings with signature invalidation', () => {
    const tool = FIXTURE_TOOLS[0]!;
    const hash1 = embeddingService.computeToolHash(tool);
    expect(hash1).toBeDefined();

    // Modifying description changes hash
    const modified = { ...tool, description: 'Updated description for reading files.' };
    const hash2 = embeddingService.computeToolHash(modified);
    expect(hash2).not.toBe(hash1);
  });

  it('retrieves top-K tools and always includes core tools', async () => {
    const results = await retriever.retrieve('search for pattern in files', {
      categories: ['fs'],
      intent: 'coding',
    });

    const toolNames = results.map((t) => t.name);

    // grep should be retrieved at top
    expect(toolNames).toContain('fs.grep');

    // Core tools must ALWAYS be included
    expect(toolNames).toContain('core.blob_read');
    expect(toolNames).toContain('core.find_tools');
  });

  it('applies category boost to relevant tools', async () => {
    // When category is office, office tools get boosted over general tools
    const results = await retriever.retrieve('inspect quarterly cells and totals', {
      categories: ['office'],
      intent: 'office',
      needs_office: true,
    });

    const topTools = results.slice(0, 3).map((t) => t.name);
    expect(topTools).toContain('office.xlsx_read_range');
  });

  it('preserves sticky tools across queries', async () => {
    // Mark fs.trash as sticky (e.g. used previously)
    retriever.markToolUsed('fs.trash');

    // Query completely unrelated to trash (e.g. web search)
    const results = await retriever.retrieve('search for news on the web', {
      categories: ['web'],
      intent: 'web',
    });

    const toolNames = results.map((t) => t.name);
    // Sticky tool must be retained!
    expect(toolNames).toContain('fs.trash');
    // Searched tool must be retrieved
    expect(toolNames).toContain('web.search');
  });

  it('shortens descriptions for small models and reports token savings (T5.5)', () => {
    const { tools: shortened, savedTokens } = retriever.shortenForSmallModel(FIXTURE_TOOLS);

    expect(shortened.length).toBe(FIXTURE_TOOLS.length);
    expect(savedTokens).toBeGreaterThan(0);

    const readFile = shortened.find((t) => t.name === 'fs.read_file');
    expect(readFile?.description).toBe('Read file contents with ranges.');
  });

  it('dynamically discovers tools via find_tools meta-tool and hot-swaps them into sticky set (T5.4)', async () => {
    // Initial state: sticky tools are empty
    expect(retriever.getAllTools().length).toBeGreaterThan(5);

    // Call find_tools for "delete or trash"
    const output = await handleFindTools(retriever, { query: 'delete or remove file to trash' });

    expect(output).toContain('fs.trash');
    expect(output).toContain('These tools are now active');

    // Subsequent retrieval should now include fs.trash as sticky tool
    const subsequent = await retriever.retrieve('what is the weather today?');
    const names = subsequent.map((t) => t.name);
    expect(names).toContain('fs.trash');
  });

  it('boosts browser tools when categories or routing includes browser', async () => {
    const browserTool: ToolDescriptor = {
      name: 'browser_navigate',
      alias: 'browser_navigate',
      description: 'Navigate active browser tab to a destination URL',
      category: 'browser',
      tier: 1,
      timeoutMs: 15000,
      annotations: {},
      inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    };
    retriever.registerTool(browserTool);

    const results = await retriever.retrieve('open ANARC browser and navigate to Gmail', {
      categories: ['browser', 'web'],
      intent: 'web',
      needs_web: true,
    });

    const toolNames = results.map((t) => t.name);
    expect(toolNames).toContain('browser_navigate');
  });
});
