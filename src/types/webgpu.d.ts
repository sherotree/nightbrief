interface GPUAdapterInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

interface GPUSupportedFeatures {
  has(feature: string): boolean;
}

interface GPUAdapter {
  features: GPUSupportedFeatures;
  info?: GPUAdapterInfo;
  requestAdapterInfo?: () => Promise<GPUAdapterInfo>;
}

interface GPU {
  requestAdapter(): Promise<GPUAdapter | null>;
}

interface Navigator {
  gpu?: GPU;
}
