import { Result } from '../../utils/Result';
import { IRenderer } from '../interfaces/IRenderer';
import { IScene } from '../interfaces/IScene';
import { ICamera } from '../interfaces/ICamera';
import { TypedEventEmitter } from '../../events/EventEmitter';

export interface IPathTracingService {
  /**
   * Event emitter for path tracing events
   */
  readonly events: TypedEventEmitter<{ 'pathtracing:paused': { samples: number } }>;
  
  /**
   * Initialize path tracing with given options
   */
  initialize(options: IPathTracingOptions): Promise<Result<void>>;
  
  /**
   * Enable or disable path tracing
   */
  setEnabled(enabled: boolean): void;
  
  /**
   * Update path tracing settings
   */
  updateSettings(settings: Partial<IPathTracingSettings>): void;
  
  /**
   * Render a frame with path tracing
   */
  render(scene: IScene, camera: ICamera): Promise<Result<void>>;
  
  /**
   * Get current sample count
   */
  getSampleCount(): number;
  
  /**
   * Check if path tracing is currently enabled
   */
  isEnabled(): boolean;
  
  /**
   * Check if path tracer has been disposed
   */
  isPathTracerDisposed(): boolean;
  
  /**
   * Reset accumulation
   */
  reset(): void;
  
  /**
   * Dispose of resources
   */
  dispose(): void;
  
  /**
   * Check if path tracing is supported
   */
  isSupported(): boolean;
}

export interface IPathTracingOptions {
  enabled: boolean;
  renderer: IRenderer;
}

export interface IPathTracingSettings {
  samples: number;
  bounces: number;
  transmissiveBounces?: number;
  renderScale: number;
  lowResScale: number;
  dynamicLowRes: boolean;
  enablePathTracing: boolean;
}