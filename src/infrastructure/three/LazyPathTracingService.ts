import {
  IPathTracingService,
  IPathTracingOptions,
  IPathTracingSettings,
} from '../../core/services/IPathTracingService';
import { IScene, ICamera, Result } from '../../core/interfaces';
import { TypedEventEmitter } from '../../events/EventEmitter';

/**
 * Lazy facade over ThreePathTracingService. three-gpu-pathtracer is ~60 kB
 * gzip — around 40% of the library payload — and only consumers who turn
 * `pathTracing.enabled` on ever need it. The dynamic import in `initialize()`
 * keeps it in a separate chunk that loads on demand, mirroring how the
 * compression decoders are handled.
 *
 * Before initialization every method is a safe no-op with the same defaults
 * an idle tracer would report (0 samples, disabled, not disposed).
 */
export class LazyPathTracingService implements IPathTracingService {
  readonly events = new TypedEventEmitter<{ 'pathtracing:paused': { samples: number } }>();

  private inner?: IPathTracingService;
  private disposed = false;
  // Settings applied before the real service finished loading are replayed
  // onto it right after construction.
  private pendingSettings?: Partial<IPathTracingSettings>;
  private pendingEnabled?: boolean;

  async initialize(options: IPathTracingOptions): Promise<Result<void>> {
    const { ThreePathTracingService } = await import('./ThreePathTracingService');
    if (this.disposed) {
      return Result.ok(undefined);
    }
    const inner = new ThreePathTracingService();
    this.inner = inner;
    inner.events.on('pathtracing:paused', (data) => {
      this.events.emit('pathtracing:paused', data);
    });
    if (this.pendingSettings) {
      inner.updateSettings(this.pendingSettings);
      this.pendingSettings = undefined;
    }
    if (this.pendingEnabled !== undefined) {
      inner.setEnabled(this.pendingEnabled);
      this.pendingEnabled = undefined;
    }
    return inner.initialize(options);
  }

  setEnabled(enabled: boolean): void {
    if (this.inner) {
      this.inner.setEnabled(enabled);
    } else {
      this.pendingEnabled = enabled;
    }
  }

  updateSettings(settings: Partial<IPathTracingSettings>): void {
    if (this.inner) {
      this.inner.updateSettings(settings);
    } else {
      this.pendingSettings = { ...this.pendingSettings, ...settings };
    }
  }

  render(scene: IScene, camera: ICamera): Promise<Result<void>> {
    if (!this.inner) {
      return Promise.resolve(Result.ok(undefined));
    }
    return this.inner.render(scene, camera);
  }

  getSampleCount(): number {
    return this.inner?.getSampleCount() ?? 0;
  }

  isEnabled(): boolean {
    return this.inner?.isEnabled() ?? false;
  }

  isPathTracerDisposed(): boolean {
    return this.inner?.isPathTracerDisposed() ?? false;
  }

  reset(): void {
    this.inner?.reset();
  }

  dispose(): void {
    this.disposed = true;
    this.inner?.dispose();
  }

  isSupported(): boolean {
    return this.inner?.isSupported() ?? true;
  }
}
