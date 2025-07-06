/**
 * Rendering behavior options
 */
export interface RenderingOptions {
  /**
   * Enable idle detection to stop rendering when inactive
   * @default true for static scenes, false for non-static scenes
   */
  enableIdleDetection?: boolean;
  
  /**
   * Time in milliseconds before entering idle state
   * @default 1000
   */
  idleDelay?: number;
  
  /**
   * Target frames per second
   * @default 60
   */
  targetFPS?: number;
  
  /**
   * Enable frame rate limiting
   * @default true
   */
  enableFrameRateLimiting?: boolean;
}