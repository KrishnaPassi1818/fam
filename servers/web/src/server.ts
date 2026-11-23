import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { webSearch } from './search.js';
import { fetchMarkdown } from './fetch.js';

export function createWebServer(): Server {
  const server = new Server(
    {
      name: 'fam-web',
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
    {
      name: 'web_search',
      description:
        'Search the public web for technical documentation, articles, benchmarks, and credible sources. Returns title, URL, and snippet for each match.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          limit: { type: 'number', description: 'Maximum number of results (default 5, max 10)' },
        },
        required: ['query'],
      },
      annotations: { readOnlyHint: true },
      category: 'web',
    },
    {
      name: 'fetch_markdown',
      description:
        'Fetch content from a webpage URL and return it cleaned as readable text/markdown.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The HTTP/HTTPS URL to fetch' },
          max_chars: { type: 'number', description: 'Maximum characters to retrieve (default 10000)' },
        },
        required: ['url'],
      },
      annotations: { readOnlyHint: true },
      category: 'web',
    },
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'web_search') {
        const query = String(args?.['query'] || '');
        const limit = typeof args?.['limit'] === 'number' ? args['limit'] : 5;
        const results = await webSearch(query, limit);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      if (name === 'fetch_markdown') {
        const url = String(args?.['url'] || '');
        const maxChars = typeof args?.['max_chars'] === 'number' ? args['max_chars'] : 10000;
        const content = await fetchMarkdown(url, maxChars);
        return {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        };
      }

      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}
