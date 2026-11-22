import type { Message, ToolDescriptor, ModelAdapter } from '@hx/shared';
import { ContextBudgeter, type ModelBudgetAllocation, type ContextAccounting } from './budget.js';
import { BlobStore } from './blobs.js';
import { ToolResultStubber } from './stubbing.js';
import { TurnCompactor } from './compactor.js';
import { EmergencyTruncator } from './truncation.js';

export interface ContextManagerOptions {
  modelId?: string;
  budget?: Partial<ModelBudgetAllocation>;
  compactorAdapter?: ModelAdapter;
  blobStore?: BlobStore;
  stubber?: ToolResultStubber;
  compactor?: TurnCompactor;
  truncator?: EmergencyTruncator;
}

export class ContextManager {
  private readonly budgeter: ContextBudgeter;
  private readonly blobStore: BlobStore;
  private readonly stubber: ToolResultStubber;
  private readonly compactor: TurnCompactor;
  private readonly truncator: EmergencyTruncator;

  constructor(options: ContextManagerOptions = {}) {
    this.budgeter = new ContextBudgeter(options.budget || options.modelId);
    this.blobStore = options.blobStore || new BlobStore();
    this.stubber = options.stubber || new ToolResultStubber();
    this.compactor =
      options.compactor ||
      new TurnCompactor({ adapter: options.compactorAdapter });
    this.truncator = options.truncator || new EmergencyTruncator();
  }

  public getBlobStore(): BlobStore {
    return this.blobStore;
  }

  public getBudget(): ModelBudgetAllocation {
    return this.budgeter.getBudget();
  }

  public account(
    systemPrompt: string,
    tools: ToolDescriptor[] = [],
    history: Message[] = [],
  ): ContextAccounting {
    return this.budgeter.account(systemPrompt, tools, history);
  }

  /**
   * Prepares and optimizes message history to strictly fit within num_ctx.
   * Executes the 4-phase ladder per Architecture §4.5:
   * 1. Blob offload (large tool outputs)
   * 2. Tool result stubbing (older results -> 1 line)
   * 3. Rolling turn compaction (older turns -> summary)
   * 4. Emergency truncation (hard drop oldest as last resort)
   */
  public async prepareContext(
    systemPrompt: string,
    tools: ToolDescriptor[],
    messages: Message[],
  ): Promise<{
    messages: Message[];
    accounting: ContextAccounting;
    appliedStrategies: string[];
  }> {
    const applied: string[] = [];
    let currentMessages = [...messages];

    // Phase 1: Blob offloading for large tool outputs
    let blobOffloadedCount = 0;
    currentMessages = currentMessages.map((msg) => {
      if (msg.role === 'tool' && this.blobStore.shouldOffload(msg.content)) {
        const meta = this.blobStore.store(msg.content);
        blobOffloadedCount++;
        return {
          ...msg,
          content: meta.summary,
        };
      }
      return msg;
    });

    if (blobOffloadedCount > 0) {
      applied.push(`blob_offload(${blobOffloadedCount})`);
    }

    // Check budget
    if (this.budgeter.fits(systemPrompt, tools, currentMessages)) {
      return {
        messages: currentMessages,
        accounting: this.budgeter.account(systemPrompt, tools, currentMessages),
        appliedStrategies: applied,
      };
    }

    // Phase 2: Stub older tool results
    const stubRes = this.stubber.stub(currentMessages);
    if (stubRes.stubbedCount > 0) {
      currentMessages = stubRes.messages;
      applied.push(`tool_stubbing(${stubRes.stubbedCount})`);
    }

    if (this.budgeter.fits(systemPrompt, tools, currentMessages)) {
      return {
        messages: currentMessages,
        accounting: this.budgeter.account(systemPrompt, tools, currentMessages),
        appliedStrategies: applied,
      };
    }

    // Phase 3: Compact older turns into a rolling summary
    const compactRes = await this.compactor.compact(currentMessages);
    if (compactRes.compacted) {
      currentMessages = compactRes.messages;
      applied.push('turn_compaction');
    }

    if (this.budgeter.fits(systemPrompt, tools, currentMessages)) {
      return {
        messages: currentMessages,
        accounting: this.budgeter.account(systemPrompt, tools, currentMessages),
        appliedStrategies: applied,
      };
    }

    // Phase 4: Emergency hard truncation (last resort)
    const acc = this.budgeter.account(systemPrompt, tools, currentMessages);
    const targetHistoryTokens = acc.availableForHistory;
    const truncRes = this.truncator.truncate(currentMessages, targetHistoryTokens);

    if (truncRes.droppedCount > 0) {
      currentMessages = truncRes.messages;
      applied.push(`emergency_truncation(${truncRes.droppedCount})`);
    }

    return {
      messages: currentMessages,
      accounting: this.budgeter.account(systemPrompt, tools, currentMessages),
      appliedStrategies: applied,
    };
  }
}
