import { Result } from '../../utils/Result';
import { IRenderer } from '../interfaces/IRenderer';
import { IScene } from '../interfaces/IScene';
import { ICamera } from '../interfaces/ICamera';
import { TypedEventEmitter } from '../../events/EventEmitter';

export type PathTracingPausedReason = 'completed' | 'gave-up';

export interface PathTracingPausedEvent {
  samples: number;
  reason: PathTracingPausedReason;
}

export interface IPathTracingService {
  readonly events: TypedEventEmitter<{ 'pathtracing:paused': PathTracingPausedEvent }>;
  
  initialize(options: IPathTracingOptions): Promise<Result<void>>;
  
  setEnabled(enabled: boolean): void;
  
  updateSettings(settings: Partial<IPathTracingSettings>): void;
  
  render(scene: IScene, camera: ICamera): Promise<Result<void>>;
  
  getSampleCount(): number;
  
  isEnabled(): boolean;
  
  isPathTracerDisposed(): boolean;

  canResume(): boolean;

  reset(force?: boolean): void;
  
  dispose(): void;
  
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