export type GpuProbe = {
  webgpu: boolean;
  shaderF16: boolean;
  adapter: string | null;
};

export async function probeGpu(): Promise<GpuProbe> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    return { webgpu: false, shaderF16: false, adapter: null };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return { webgpu: false, shaderF16: false, adapter: null };
    }

    const shaderF16 = adapter.features.has("shader-f16");
    const info =
      "info" in adapter && adapter.info
        ? adapter.info
        : await adapter.requestAdapterInfo?.();
    const adapterName =
      info?.description || info?.device || info?.vendor || null;

    return { webgpu: true, shaderF16, adapter: adapterName };
  } catch {
    return { webgpu: false, shaderF16: false, adapter: null };
  }
}
