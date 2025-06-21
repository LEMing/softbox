export interface PathTracingOptions {
  enabled?: boolean;
  maxSamples?: number;
  bounces?: number;
  transmissiveBounces?: number;
  renderScale?: number;
  lowResScale?: number;
  dynamicLowRes?: boolean;
}