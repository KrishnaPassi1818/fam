import {
  type ModelAdapter,
  type ModelCaps,
  type ToolDescriptor,
  type ChatRequest,
} from '@hx/shared';

const TEST_TOOLS: ToolDescriptor[] = [
  {
    name: 'test.echo_tool',
    alias: 'echo_tool',
    description: 'Echoes back a test message.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
    annotations: { readOnlyHint: true },
    category: 'test',
    tier: 0,
    timeoutMs: 5000,
  },
  {
    name: 'test.second_tool',
    alias: 'second_tool',
    description: 'A second test tool for testing parallel calls.',
    inputSchema: {
      type: 'object',
      properties: {
        val: { type: 'number' },
      },
      required: ['val'],
    },
    annotations: { readOnlyHint: true },
    category: 'test',
    tier: 0,
    timeoutMs: 5000,
  },
];

export async function probeModelCapabilities(adapter: ModelAdapter): Promise<ModelCaps> {
  let tools = false;
  let parallelTools = false;
  let jsonSchemaFormat = false;

  // 1. Probe native tool calling
  try {
    const req: ChatRequest = {
      messages: [
        {
          role: 'user',
          content: 'You must call the echo_tool function with message="ping". Do not reply with normal text, only call the function.',
        },
      ],
      tools: TEST_TOOLS,
      temperature: 0.1,
    };

    for await (const chunk of adapter.chat(req)) {
      if (chunk.toolCalls && chunk.toolCalls.length > 0) {
        if (chunk.toolCalls.some((c) => c.name === 'echo_tool')) {
          tools = true;
        }
      }
    }
  } catch {
    tools = false;
  }

  // 2. Probe parallel tool calling (only if tools is true)
  if (tools) {
    try {
      const req: ChatRequest = {
        messages: [
          {
            role: 'user',
            content: 'Call both echo_tool with message="ping" AND second_tool with val=123 simultaneously.',
          },
        ],
        tools: TEST_TOOLS,
        temperature: 0.1,
      };

      const accumulatedCalls = [];
      for await (const chunk of adapter.chat(req)) {
        if (chunk.toolCalls) {
          accumulatedCalls.push(...chunk.toolCalls);
        }
      }
      if (accumulatedCalls.length >= 2) {
        parallelTools = true;
      }
    } catch {
      parallelTools = false;
    }
  }

  // 3. Probe JSON schema format
  try {
    const testSchema = {
      type: 'object',
      properties: {
        verified: { type: 'boolean' },
        code: { type: 'number' },
      },
      required: ['verified', 'code'],
    };

    const req: ChatRequest = {
      messages: [
        {
          role: 'user',
          content: 'Return a JSON object with verified=true and code=200.',
        },
      ],
      jsonSchema: testSchema,
      temperature: 0.1,
    };

    let text = '';
    for await (const chunk of adapter.chat(req)) {
      text += chunk.delta;
    }

    const parsed = JSON.parse(text.trim());
    if (parsed && typeof parsed.verified === 'boolean' && typeof parsed.code === 'number') {
      jsonSchemaFormat = true;
    }
  } catch {
    jsonSchemaFormat = false;
  }

  return {
    tools,
    parallelTools,
    vision: adapter.caps.vision,
    jsonSchemaFormat,
    maxCtx: adapter.caps.maxCtx,
  };
}
