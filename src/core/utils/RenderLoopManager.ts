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
  
  private needsRender: boolean = true;
  private continuousRenderingEnabled: boolean = false;
  private readonly continuousReasons: Set<string> = new Set();
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
  
  requestRender(): void {
    this.needsRender = true;
    this.wakeUp();
  }
  
  requireContinuous(reason: string): void {
    this.continuousReasons.add(reason);
    this.continuousRenderingEnabled = true;
    this.wakeUp();
  }

  releaseContinuous(reason: string): void {
    this.continuousReasons.delete(reason);
    this.continuousRenderingEnabled = this.continuousReasons.size > 0;
  }

  hasContinuousDemand(): boolean {
    return this.continuousReasons.size > 0;
  }
  
  setAlwaysRender(enabled: boolean): void {
    this.alwaysRender = enabled;
    if (enabled) {
      this.wakeUp();
    }
  }
  
  private wakeUp(): void {
    if (this.idleTimeout !== null) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    this.isIdle = false;
  }
  
  start(renderCallback: (deltaTime: number) => void): void {
    if (this.animationFrameId !== null) {
      return;
    }
    
    const animate = (currentTime: number) => {
      if (this.animationFrameId === null) {
        return;
      }
      
      const deltaTime = currentTime - this.lastRenderTime;
      
      if (this.enableFrameRateLimiting && deltaTime < this.frameInterval) {
        this.animationFrameId = requestAnimationFrame(animate);
        return;
      }
      
      const shouldRender = this.alwaysRender || this.needsRender || this.continuousRenderingEnabled;

      if (shouldRender) {
        renderCallback(deltaTime);
        this.lastRenderTime = currentTime;
        this.needsRender = false;
      }

      if (this.enableIdleDetection && !this.alwaysRender) {
        if (this.continuousRenderingEnabled || this.needsRender) {
          this.wakeUp();
        } else if (this.idleTimeout === null && !this.isIdle) {
          this.idleTimeout = window.setTimeout(() => {
            this.isIdle = true;
          }, this.idleDelay);
        }
      }

      const shouldContinue = this.alwaysRender || 
                           !this.enableIdleDetection || 
                           !this.isIdle || 
                           this.continuousRenderingEnabled ||
                           this.needsRender;
      
      if (shouldContinue) {
        this.animationFrameId = requestAnimationFrame(animate);
      } else {
        this.animationFrameId = null;
      }
    };
    
    this.animationFrameId = requestAnimationFrame(animate);
  }
  
  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    if (this.idleTimeout !== null) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    
    this.isIdle = false;
    this.needsRender = false;
    this.continuousRenderingEnabled = false;
    this.continuousReasons.clear();
    this.alwaysRender = false;
  }
  
  isRunning(): boolean {
    return this.animationFrameId !== null;
  }
  
  getIsIdle(): boolean {
    return this.isIdle;
  }
  
  getNeedsRender(): boolean {
    return this.needsRender || this.continuousRenderingEnabled || this.alwaysRender;
  }
}