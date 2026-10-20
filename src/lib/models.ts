/**
 * Model IDs from WebLLM's prebuilt catalog (`prebuiltAppConfig` in
 * `@mlc-ai/web-llm` 0.2.86, matching mlc-ai/web-llm `src/config.ts`).
 * VRAM figures are the `vram_required_MB` values published there.
 */
export type GemmaChoice = {
  id: string;
  label: string;
  detail: string;
  vramMb: number;
  context: number;
  needsShaderF16: boolean;
};

export const GEMMA_MODELS: readonly GemmaChoice[] = [
  {
    id: "gemma-2-2b-it-q4f16_1-MLC",
    label: "Gemma 2 2B",
    detail: "q4f16 · 4k context · best default when the GPU has shader-f16",
    vramMb: 1895,
    context: 4096,
    needsShaderF16: true,
  },
  {
    id: "gemma3-1b-it-q4f16_1-MLC",
    label: "Gemma 3 1B",
    detail: "q4f16 · 2k context · lighter download, needs shader-f16",
    vramMb: 711,
    context: 2048,
    needsShaderF16: true,
  },
  {
    id: "gemma-2-2b-it-q4f32_1-MLC",
    label: "Gemma 2 2B f32",
    detail: "q4f32 · 4k context · for GPUs without shader-f16",
    vramMb: 2509,
    context: 4096,
    needsShaderF16: false,
  },
] as const;

export const DEFAULT_F16_MODEL = "gemma-2-2b-it-q4f16_1-MLC";
export const DEFAULT_F32_MODEL = "gemma-2-2b-it-q4f32_1-MLC";

export function pickDefaultModel(shaderF16: boolean): string {
  return shaderF16 ? DEFAULT_F16_MODEL : DEFAULT_F32_MODEL;
}

export function findModel(id: string): GemmaChoice | undefined {
  return GEMMA_MODELS.find((model) => model.id === id);
}

/**
 * WebLLM 0.2.86's Gemma 3 record forces a 4096 context on top of the
 * model's own sliding window (512). The runtime rejects that pair.
 * Nightbrief keeps a full 2048-token window and turns the sliding window off.
 */
export function chatOptionsFor(
  modelId: string,
): { context_window_size: number; sliding_window_size: number } | undefined {
  if (modelId === "gemma3-1b-it-q4f16_1-MLC") {
    return { context_window_size: 2048, sliding_window_size: -1 };
  }
  return undefined;
}
