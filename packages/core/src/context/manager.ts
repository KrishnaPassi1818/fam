import type { Message, ToolDescriptor, ModelAdapter } from '@fam/shared';
import { ContextBudgeter, type ModelBudgetAllocation, type ContextAccounting } from './budget.js';
import { BlobStore } from './blobs.js';
import { ToolResultStubber } from './stubbing.js';
import { TurnCompactor } from './compactor.js';
import { EmergencyTruncator } from './truncation.js';
import { TaskContextManager, type TaskContext } from './task-context.js';

export interface ContextManagerOptions {
  modelId?: string;
  budget?: Partial<ModelBudgetAllocation>;
  compactorAdapter?: ModelAdapter;
  blobStore?: BlobStore;
  stubber?: ToolResultStubber;
  compactor?: TurnCompactor;
  truncator?: EmergencyTruncator;
  taskContextManager?: TaskContextManager;
}

export class ContextManager {
  private readonly budgeter: ContextBudgeter;
  private readonly blobStore: BlobStore;
  private readonly stubber: ToolResultStubber;
  private readonly compactor: TurnCompactor;
  private readonly truncator: EmergencyTruncator;
  private readonly taskContextManager: TaskContextManager;

  constructor(options: ContextManagerOptions = {}) {
    this.budgeter = new ContextBudgeter(options.budget || options.modelId);
    this.blobStore = options.blobStore || new BlobStore();
    this.stubber = options.stubber || new ToolResultStubber();
    this.compactor =
      options.compactor ||
      new TurnCompactor({ adapter: options.compactorAdapter });
    this.truncator = options.truncator || new EmergencyTruncator();
    this.taskContextManager = options.taskContextManager || new TaskContextManager();
  }

  public getBlobStore(): BlobStore {
    return this.blobStore;
  }

  public getBudget(): ModelBudgetAllocation {
    return this.budgeter.getBudget();
  }

  public getTaskContextManager(): TaskContextManager {
    return this.taskContextManager;
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
   * Executes observation invalidation and the 4-phase ladder per Architecture §4.5:
   * 0. Invalidate stale observations (DOM / file modifications)
   * 1. Blob offload (large tool outputs)
   * 2. Tool result stubbing (older results -> 1 line)
   * 3. Rolling turn compaction (older turns -> summary)
   * 4. Emergency truncation (hard drop oldest as last resort)
   */
  public async prepareContext(
    systemPrompt: string,
    tools: ToolDescriptor[],
    messages: Message[],
    taskContext?: TaskContext,
  ): Promise<{
    messages: Message[];
    accounting: ContextAccounting;
    appliedStrategies: string[];
  }> {
    const applied: string[] = [];
    let currentMessages = [...messages];
    const task = taskContext || this.taskContextManager.getActiveTask();

    // Phase 0: Stale Observation Invalidation
    if (task) {
      let invalidatedCount = 0;
      currentMessages = currentMessages.map((msg) => {
        if (msg.role !== 'tool') return msg;

        let content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

        // Check DOM invalidation
        if (task.domObservation && task.domObservation.stale) {
          if (content.includes('<!DOCTYPE') || content.includes('<html') || content.includes('browser_read_dom') || content.includes('Page DOM:')) {
            content = `[STALE OBSERVATION INVALIDATED: Browser navigated to ${task.browserSession?.currentUrl || 'new page'}; previous DOM is no longer valid]`;
            invalidatedCount++;
          }
        }

        // Check File invalidation
        for (const [path, obs] of task.fileObservations.entries()) {
          if (obs.stale && content.includes(path)) {
            content = `[STALE OBSERVATION INVALIDATED: File "${path}" was modified or deleted; cached contents are no longer valid]`;
            invalidatedCount++;
            break;
          }
        }

        return {
          ...msg,
          content,
        };
      });

      if (invalidatedCount > 0) {
        applied.push(`observation_invalidation(${invalidatedCount})`);
      }
    }

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
