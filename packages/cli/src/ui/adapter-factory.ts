import { OllamaAdapter, GeminiAdapter } from '@fam/core';
import type { ModelAdapter, FamConfig, ModelProfile } from '@fam/shared';

export interface CreateAdapterOptions {
  modelId: string;
  config: FamConfig;
  localOnly?: boolean;
}

export function createAdapter(options: CreateAdapterOptions): ModelAdapter {
  const { modelId, config, localOnly } = options;

  if (modelId.startsWith('gemini') || modelId.includes('gemini')) {
    if (localOnly) {
      throw new Error(`Model '${modelId}' requested, but --local-only is active.`);
    }
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) {
      throw new Error(`GEMINI_API_KEY is required to run '${modelId}'. Set it or use a local model.`);
    }
    return new GeminiAdapter({
      model: modelId,
      apiKey,
    });
  }

  // Local Ollama adapter
  const profile = config.models.models[modelId] as ModelProfile | undefined;
  const placement = profile?.placement || 'gpu';
  const numGpu = placement === 'cpu' ? 0 : profile?.numGpu;

  return new OllamaAdapter({
    model: modelId,
    host: process.env['FAM_OLLAMA_HOST'] || process.env['HX_OLLAMA_HOST'] || 'http://127.0.0.1:11434',
    numGpu,
    numCtx: profile?.numCtx,
  });
}
