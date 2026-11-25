import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelScheduler } from '../models/scheduler.js';

describe('Phase 5: Local Model Scheduler & Lock (T5.6)', () => {
  let scheduler: ModelScheduler;

  beforeEach(() => {
    scheduler = new ModelScheduler();
    scheduler.resetSwapCount();
  });

  it('identifies cloud vs local GPU vs CPU models correctly', () => {
    expect(scheduler.isCloudModel('gemini:gemini-2.5-flash')).toBe(true);
    expect(scheduler.isCloudModel('ollama:qwen3.5:4b')).toBe(false);

    expect(scheduler.isGpuModel('ollama:qwen3.5:4b')).toBe(true);
    expect(scheduler.isGpuModel('qwen2.5-coder:7b')).toBe(true);

    expect(scheduler.isCpuModel('ollama:qwen2.5:1.5b')).toBe(true);
    expect(scheduler.isCpuModel('nomic-embed-text')).toBe(true);
  });

  it('runs consecutive calls on the same GPU model without swapping', async () => {
    const unloadSpy = vi.spyOn(scheduler, 'unloadModel').mockResolvedValue(undefined);

    await scheduler.withModel('ollama:qwen3.5:4b', async () => 'result 1');
    await scheduler.withModel('ollama:qwen3.5:4b', async () => 'result 2');
    await scheduler.withModel('ollama:qwen3.5:4b', async () => 'result 3');

    expect(scheduler.getSwapCount()).toBe(0);
    expect(unloadSpy).not.toHaveBeenCalled();
    expect(scheduler.getCurrentGpuModel()).toBe('qwen3.5:4b');
  });

  it('tracks swaps and calls unload when alternating between GPU models', async () => {
    const unloadSpy = vi.spyOn(scheduler, 'unloadModel').mockResolvedValue(undefined);

    // Run task on qwen3.5:4b
    await scheduler.withModel('ollama:qwen3.5:4b', async () => 'turn 1');
    expect(scheduler.getSwapCount()).toBe(0);

    // Switch to qwen2.5-coder:7b -> requires 1 unload & swap
    await scheduler.withModel('ollama:qwen2.5-coder:7b', async () => 'turn 2');
    expect(scheduler.getSwapCount()).toBe(1);
    expect(unloadSpy).toHaveBeenCalledWith('qwen3.5:4b');
    expect(scheduler.getCurrentGpuModel()).toBe('qwen2.5-coder:7b');

    // Switch back to qwen3.5:4b -> requires another unload & swap
    await scheduler.withModel('ollama:qwen3.5:4b', async () => 'turn 3');
    expect(scheduler.getSwapCount()).toBe(2);
    expect(unloadSpy).toHaveBeenCalledWith('qwen2.5-coder:7b');
  });

  it('allows cloud models to bypass the local GPU lock without swapping', async () => {
    const unloadSpy = vi.spyOn(scheduler, 'unloadModel').mockResolvedValue(undefined);

    // Load GPU model
    await scheduler.withModel('ollama:qwen3.5:4b', async () => 'turn 1');

    // Execute cloud model
    const cloudRes = await scheduler.withModel('gemini:gemini-2.5-flash', async () => 'cloud result');
    expect(cloudRes).toBe('cloud result');

    // GPU model is STILL loaded and swap count is NOT incremented!
    expect(scheduler.getSwapCount()).toBe(0);
    expect(scheduler.getCurrentGpuModel()).toBe('qwen3.5:4b');
    expect(unloadSpy).not.toHaveBeenCalled();
  });

  it('serializes concurrent local model calls safely', async () => {
    const executionOrder: string[] = [];

    const call1 = scheduler.withModel('ollama:qwen3.5:4b', async () => {
      executionOrder.push('start 1');
      await new Promise((r) => setTimeout(r, 50));
      executionOrder.push('end 1');
      return 1;
    });

    const call2 = scheduler.withModel('ollama:qwen3.5:4b', async () => {
      executionOrder.push('start 2');
      await new Promise((r) => setTimeout(r, 10));
      executionOrder.push('end 2');
      return 2;
    });

    await Promise.all([call1, call2]);

    // Must be serialized: start 1 -> end 1 -> start 2 -> end 2
    expect(executionOrder).toEqual(['start 1', 'end 1', 'start 2', 'end 2']);
  });
});
