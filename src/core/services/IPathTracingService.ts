import type * as THREE from 'three';
import { Result } from '../../utils/Result';
import type { ViewerRenderer } from '../rendering/ViewerRenderer';
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
  
  render(scene: THREE.Scene, camera: THREE.Camera): Promise<Result<void>>;
  
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
  renderer: ViewerRenderer;
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