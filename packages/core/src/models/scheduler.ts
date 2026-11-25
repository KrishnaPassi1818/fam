export interface ModelSchedulerOptions {
  ollamaBaseUrl?: string;
  gpuModels?: string[];
  cpuModels?: string[];
}

export class ModelScheduler {
  private readonly ollamaBaseUrl: string;
  private readonly gpuModels: Set<string>;
  private readonly cpuModels: Set<string>;

  private currentLoadedGpuModel: string | null = null;
  private swapCount = 0;
  private mutexQueue: Array<() => void> = [];
  private locked = false;

  constructor(options: ModelSchedulerOptions = {}) {
    this.ollamaBaseUrl = options.ollamaBaseUrl || process.env['OLLAMA_BASE_URL'] || 'http://127.0.0.1:11434';
    this.gpuModels = new Set(
      options.gpuModels || [
        'qwen3.5:4b',
        'qwen2.5-coder:7b',
        'ollama:qwen3.5:4b',
        'ollama:qwen2.5-coder:7b',
      ]
    );
    this.cpuModels = new Set(
      options.cpuModels || [
        'qwen2.5:1.5b',
        'nomic-embed-text',
        'ollama:qwen2.5:1.5b',
        'ollama:nomic-embed-text',
      ]
    );
  }

  public isCloudModel(model: string): boolean {
    return (
      model.startsWith('gemini:') ||
      model.startsWith('google:') ||
      model.startsWith('cloud:') ||
      model.startsWith('anthropic:') ||
      model.startsWith('openai:')
    );
  }

  public isGpuModel(model: string): boolean {
    if (this.isCloudModel(model)) return false;
    const clean = model.replace(/^ollama:/, '');
    return this.gpuModels.has(model) || this.gpuModels.has(clean);
  }

  public isCpuModel(model: string): boolean {
    const clean = model.replace(/^ollama:/, '');
    return this.cpuModels.has(model) || this.cpuModels.has(clean);
  }

  public getSwapCount(): number {
    return this.swapCount;
  }

  public resetSwapCount(): void {
    this.swapCount = 0;
  }

  public getCurrentGpuModel(): string | null {
    return this.currentLoadedGpuModel;
  }

  private async acquireLock(): Promise<() => void> {
    return new Promise((resolve) => {
      const run = () => {
        this.locked = true;
        resolve(() => {
          this.locked = false;
          const next = this.mutexQueue.shift();
          if (next) {
            next();
          }
        });
      };

      if (!this.locked) {
        run();
      } else {
        this.mutexQueue.push(run);
      }
    });
  }

  /**
   * Request Ollama to explicitly unload a model from GPU VRAM.
   */
  public async unloadModel(modelName: string): Promise<void> {
    const cleanModel = modelName.replace(/^ollama:/, '');
    try {
      await fetch(`${this.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cleanModel,
          keep_alive: 0, // 0 tells Ollama to unload immediately
        }),
      });
    } catch {
      // Best-effort unload
    }
  }

  /**
   * Schedules execution for a model:
   * - Cloud models (Gemini) bypass the local scheduler and execute immediately in parallel.
   * - Local models are serialized.
   * - If a different GPU model is requested, unloads the old GPU model first and increments swap count.
   */
  public async withModel<T>(model: string, fn: () => Promise<T>): Promise<T> {
    // Cloud models bypass the local lock
    if (this.isCloudModel(model)) {
      return fn();
    }

    // Local models acquire the mutex
    const release = await this.acquireLock();
    try {
      const isGpu = this.isGpuModel(model);

      if (isGpu) {
        const clean = model.replace(/^ollama:/, '');
        if (this.currentLoadedGpuModel && this.currentLoadedGpuModel !== clean) {
          // Model swap required!
          await this.unloadModel(this.currentLoadedGpuModel);
          this.swapCount++;
        }
        this.currentLoadedGpuModel = clean;
      }

      return await fn();
    } finally {
      release();
    }
  }
}
