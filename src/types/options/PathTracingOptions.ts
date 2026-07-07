/**
 * Progressive path tracing for photoreal rendering (three-gpu-pathtracer).
 * Interactive: while the camera moves you see a fast preview, and whenever it
 * rests the tracer re-accumulates to a converged frame — orbiting after
 * convergence starts a fresh accumulation from the new viewpoint. The tracer
 * stays warm for the viewer's lifetime; it ships in a lazy chunk that loads
 * only when enabled. While animations play, accumulation is suspended (the
 * raster renderer shows the motion) and resumes on the paused pose.
 *
 * The whole object is structural in `<SimpleViewer>`: changing ANY field
 * rebuilds the viewer (and reloads the model).
 */
export interface PathTracingOptions {
  /** Builds the tracer at viewer construction. */
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
