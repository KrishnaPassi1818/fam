import type { ToolDescriptor } from '@hx/shared';
import type { ToolRetriever } from '../retriever.js';

export const FIND_TOOLS_DESCRIPTOR: ToolDescriptor = {
  name: 'core.find_tools',
  alias: 'find_tools',
  description: 'Search the harness tool registry for additional tools matching keywords or category and load them into active context.',
  shortDescription: 'Find and activate additional tools.',
  category: 'core',
  tier: 0,
  timeoutMs: 5000,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keywords describing the required capability or task',
      },
      category: {
        type: 'string',
        description: 'Optional category filter (e.g. fs, office, web, git, system)',
      },
    },
    required: ['query'],
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export interface FindToolsArgs {
  query: string;
  category?: string;
}

export async function handleFindTools(
  retriever: ToolRetriever,
  args: FindToolsArgs
): Promise<string> {
  const query = args.query.trim();
  const category = args.category?.trim();

  const retrieved = await retriever.retrieve(
    query,
    category ? { categories: [category], intent: category as any } : undefined,
    5
  );

  // Filter out core tools so we show newly discovered tools
  const discovered = retrieved.filter((t) => t.name !== FIND_TOOLS_DESCRIPTOR.name && t.category !== 'core');

  if (discovered.length === 0) {
    return `No additional tools found matching query "${query}". Available tools remain unchanged.`;
  }

  // Mark all discovered tools as sticky in retriever so they remain in active context
  for (const tool of discovered) {
    retriever.markToolUsed(tool.name);
  }

  const lines = [
    `Found and activated ${discovered.length} tool(s) matching "${query}":`,
    ...discovered.map((t) => `- ${t.name} (alias: ${t.alias}): ${t.description}`),
    '',
    'These tools are now active and ready to be called in subsequent steps.',
  ];

  return lines.join('\n');
}
