/**
 * Manages render loop with idle detection and performance optimization
 */
export interface RenderLoopOptions {
  enableIdleDetection?: boolean;
  idleDelay?: number;
  targetFPS?: number;
  enableFrameRateLimiting?: boolean;
  alwaysRender?: boolean;
}

export class RenderLoopManager {
  private animationFrameId: number | null = null;
  private lastRenderTime: number = 0;
  private idleTimeout: number | null = null;
  private isIdle: boolean = false;
  private readonly enableIdleDetection: boolean;
  private readonly idleDelay: number;
  private readonly targetFPS: number;
  private readonly frameInterval: number;
  private readonly enableFrameRateLimiting: boolean;
  
  // Tracking what needs rendering
  private needsRender: boolean = true;
  private continuousRenderingEnabled: boolean = false;
  private alwaysRender: boolean = false;
  
  constructor(options: RenderLoopOptions = {}) {
    this.enableIdleDetection = options.enableIdleDetection ?? true;
    this.idleDelay = options.idleDelay ?? 1000;
    this.targetFPS = options.targetFPS ?? 60;
    this.frameInterval = 1000 / this.targetFPS;
    this.enableFrameRateLimiting = options.enableFrameRateLimiting ?? true;
    this.alwaysRender = options.alwaysRender ?? false;
    this.lastRenderTime = performance.now();
  }
  
  /**
   * Request a render on the next frame
   */
  requestRender(): void {
    this.needsRender = true;
    this.wakeUp();
  }
  
  /**
   * Enable continuous rendering (e.g., for animations)
   */
  enableContinuousRendering(): void {
    this.continuousRenderingEnabled = true;
    this.wakeUp();
  }
  
  /**
   * Disable continuous rendering
   */
  disableContinuousRendering(): void {
    this.continuousRenderingEnabled = false;
  }
  
  /**
   * Set always render mode (for non-static scenes)
   */
  setAlwaysRender(enabled: boolean): void {
    this.alwaysRender = enabled;
    if (enabled) {
      this.wakeUp();
    }
  }
  
  /**
   * Wake up from idle state
   */
  private wakeUp(): void {
    if (this.idleTimeout !== null) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    this.isIdle = false;
  }
  
  /**
   * Start the render loop
   */
  start(renderCallback: (deltaTime: number) => void): void {
    if (this.animationFrameId !== null) {
      return; // Already running
    }
    
    const animate = (currentTime: number) => {
      // Check if we should continue
      if (this.animationFrameId === null) {
        return;
      }
      
      // Calculate delta time
      const deltaTime = currentTime - this.lastRenderTime;
      
      // Frame rate limiting
      if (this.enableFrameRateLimiting && deltaTime < this.frameInterval) {
        this.animationFrameId = requestAnimationFrame(animate);
        return;
      }
      
      // Check if we need to render
      const shouldRender = this.alwaysRender || this.needsRender || this.continuousRenderingEnabled;
      
      if (shouldRender) {
        renderCallback(deltaTime);
        this.lastRenderTime = currentTime;
        this.needsRender = false;
        
        // Reset idle timer only if idle detection is enabled
        if (this.enableIdleDetection && !this.alwaysRender) {
          this.wakeUp();
          
          // Set up idle detection
          if (!this.continuousRenderingEnabled) {
            this.idleTimeout = window.setTimeout(() => {
              this.isIdle = true;
            }, this.idleDelay);
          }
        }
      }
      
      // Continue loop based on mode and idle state
      const shouldContinue = this.alwaysRender || 
                           !this.enableIdleDetection || 
                           !this.isIdle || 
                           this.continuousRenderingEnabled ||
                           this.needsRender;
      
      if (shouldContinue) {
        this.animationFrameId = requestAnimationFrame(animate);
      } else {
        // Stop the loop when idle
        this.animationFrameId = null;
      }
    };
    
    this.animationFrameId = requestAnimationFrame(animate);
  }
  
  /**
   * Stop the render loop
   */
  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    if (this.idleTimeout !== null) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    
    // Reset all flags to prevent restart
    this.isIdle = false;
    this.needsRender = false;
    this.continuousRenderingEnabled = false;
    this.alwaysRender = false;
  }
  
  /**
   * Check if render loop is running
   */
  isRunning(): boolean {
    return this.animationFrameId !== null;
  }
  
  /**
   * Get idle state
   */
  getIsIdle(): boolean {
    return this.isIdle;
  }
  
  /**
   * Check if currently needs render
   */
  getNeedsRender(): boolean {
    return this.needsRender || this.continuousRenderingEnabled || this.alwaysRender;
  }
}