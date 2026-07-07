/**
 * Progressive path tracing for photoreal stills (three-gpu-pathtracer). The
 * tracer accumulates samples whenever the camera rests and presents the
 * converged frame; it ships in a lazy chunk that loads only when enabled.
 */
export interface PathTracingOptions {
  /** Structural: enabling builds the tracer at viewer construction. */
  enabled?: boolean;
  /**
   * Samples to accumulate before the frame counts as converged
   * (`pathtracing:complete`, and what a path-traced `captureStill()` awaits).
   * More samples = cleaner image, linearly more GPU time.
   */
  maxSamples?: number;
  /** Light-path depth: how many surface bounces each ray may take. */
  bounces?: number;
  /** Extra ray depth through transmissive (glass-like) materials. */
  transmissiveBounces?: number;
  /** Accumulation resolution as a fraction of canvas size (0.5 = quarter pixels, 4× faster). */
  renderScale?: number;
  /** Resolution fraction of the fast preview shown while the camera moves. */
  lowResScale?: number;
  /** Drop to the low-res preview during interaction instead of stalling. */
  dynamicLowRes?: boolean;
}
