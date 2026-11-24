import { estimateTokens, type Message, type ToolDescriptor } from '@fam/shared';

export interface ModelBudgetAllocation {
  numCtx: number;
  system: number;
  tools: number;
  memory: number;
  history: number;
  reserve: number; // generation work reserve
}

export const DEFAULT_BUDGETS: Record<string, ModelBudgetAllocation> = {
  '4b': {
    numCtx: 4096,
    system: 400,
    tools: 1800,
    memory: 400,
    history: 996,
    reserve: 500,
  },
  '8b': {
    numCtx: 8192,
    system: 500,
    tools: 4000,
    memory: 500,
    history: 2192,
    reserve: 1000,
  },
  '7b': {
    numCtx: 8192,
    system: 500,
    tools: 4000,
    memory: 500,
    history: 2192,
    reserve: 1000,
  },
  '1.5b': {
    numCtx: 4096,
    system: 300,
    tools: 1500,
    memory: 300,
    history: 1196,
    reserve: 800,
  },
  large: {
    numCtx: 1048576,
    system: 4000,
    tools: 10000,
    memory: 4000,
    history: 100000,
    reserve: 8192,
  },
};

export interface ContextAccounting {
  systemTokens: number;
  toolsTokens: number;
  historyTokens: number;
  totalTokens: number;
  availableForHistory: number;
  budget: ModelBudgetAllocation;
  exceedsBudget: boolean;
}

export class ContextBudgeter {
  private readonly budget: ModelBudgetAllocation;

  constructor(budgetOrModelId?: string | Partial<ModelBudgetAllocation>) {
    if (typeof budgetOrModelId === 'object' && budgetOrModelId !== null) {
      this.budget = {
        ...DEFAULT_BUDGETS['4b']!,
        ...budgetOrModelId,
      };
    } else if (typeof budgetOrModelId === 'string') {
      this.budget = this.resolveBudget(budgetOrModelId);
    } else {
      this.budget = DEFAULT_BUDGETS['4b']!;
    }
  }

  public getBudget(): ModelBudgetAllocation {
    return { ...this.budget };
  }

  private resolveBudget(modelId: string): ModelBudgetAllocation {
    if (modelId.includes('gemini') || modelId.includes('large')) {
      return DEFAULT_BUDGETS['large']!;
    }
    if (modelId.includes('1.5b')) {
      return DEFAULT_BUDGETS['1.5b']!;
    }
    if (modelId.includes('4b') || modelId.includes('qwen3.5')) {
      return DEFAULT_BUDGETS['4b']!;
    }
    if (modelId.includes('7b') || modelId.includes('coder')) {
      return DEFAULT_BUDGETS['7b']!;
    }
    return DEFAULT_BUDGETS['4b']!;
  }

  public calculateToolsTokens(tools: ToolDescriptor[] = []): number {
    if (tools.length === 0) return 0;
    const jsonStr = JSON.stringify(
      tools.map((t) => ({
        name: t.alias || t.name,
        description: t.shortDescription || t.description,
        parameters: t.inputSchema,
      })),
    );
    return estimateTokens(jsonStr);
  }

  public calculateHistoryTokens(messages: Message[] = []): number {
    let total = 0;
    for (const msg of messages) {
      if (msg.role !== 'system') {
        total += estimateTokens(msg.content);
        if (msg.role === 'assistant' && msg.toolCalls) {
          total += estimateTokens(JSON.stringify(msg.toolCalls));
        }
      }
    }
    return total;
  }

  public account(
    systemPrompt: string,
    tools: ToolDescriptor[] = [],
    history: Message[] = [],
  ): ContextAccounting {
    const systemTokens = estimateTokens(systemPrompt);
    const toolsTokens = this.calculateToolsTokens(tools);
    const historyTokens = this.calculateHistoryTokens(history);

    const totalTokens = systemTokens + toolsTokens + historyTokens;
    const maxAvailable = this.budget.numCtx - this.budget.reserve - systemTokens - toolsTokens;
    const availableForHistory = Math.max(0, maxAvailable);
    const exceedsBudget = totalTokens + this.budget.reserve > this.budget.numCtx;

    return {
      systemTokens,
      toolsTokens,
      historyTokens,
      totalTokens,
      availableForHistory,
      budget: this.budget,
      exceedsBudget,
    };
  }

  public fits(
    systemPrompt: string,
    tools: ToolDescriptor[] = [],
    history: Message[] = [],
  ): boolean {
    const acc = this.account(systemPrompt, tools, history);
    return !acc.exceedsBudget;
  }
}
