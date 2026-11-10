import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import type { ViewerRenderer } from './rendering/ViewerRenderer';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from './events/CoreViewerEvents';
import { ThreeViewerError, ErrorCode } from '../errors';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { deepMerge } from '../utils/deepMerge';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { PathTracingCoordinator } from './PathTracingCoordinator';
import { CaptureController } from './CaptureController';
import { EnvironmentController } from './EnvironmentController';
import { AnimationController } from './AnimationController';
import { MaterialVariantController } from './MaterialVariantController';

export interface RuntimeOptionsControllerDependencies {
  renderer: ViewerRenderer;
  scene: THREE.Scene;
  controls: OrbitControls;
  events: TypedEventEmitter<ViewerEventMap>;
  renderLoopManager: RenderLoopManager;
  pathTracing: PathTracingCoordinator;
  capture: CaptureController;
  environment: EnvironmentController;
  animations: AnimationController;
  variants: MaterialVariantController;
  hasModel: () => boolean;
  getOptions: () => SimpleViewerOptions;
  setOptions: (options: SimpleViewerOptions) => void;
  isDisposed: () => boolean;
  repaint: () => void;
}

type OptionsUpdate = Partial<SimpleViewerOptions>;

interface PreviousOptions {
  autoplay: boolean | string | undefined;
  autoRotate: boolean | undefined;
  pathTracingEnabled: boolean;
  postEffects: string;
  backgroundColor: SimpleViewerOptions['backgroundColor'];
  backgroundColorEdge: SimpleViewerOptions['backgroundColorEdge'];
  environmentIntensity: number | undefined;
  variant: SimpleViewerOptions['variant'];
}

const postEffectsKey = (options: SimpleViewerOptions): string => {
  const renderer = options.renderer;
  return JSON.stringify([
    renderer?.bloom ?? false,
    renderer?.vignette ?? false,
    renderer?.filmGrain ?? false,
    renderer?.colorGrade ?? false,
  ]);
};

const snapshot = (options: SimpleViewerOptions): PreviousOptions => ({
  autoplay: options.animations?.autoplay,
  autoRotate: options.controls?.autoRotate,
  pathTracingEnabled: options.pathTracing?.enabled ?? false,
  postEffects: postEffectsKey(options),
  backgroundColor: options.backgroundColor,
  backgroundColorEdge: options.backgroundColorEdge,
  environmentIntensity: options.environment?.environmentIntensity,
  variant: options.variant,
});

export class RuntimeOptionsController {
  private readonly deps: RuntimeOptionsControllerDependencies;

  constructor(deps: RuntimeOptionsControllerDependencies) {
    this.deps = deps;
  }

  apply(partial: OptionsUpdate): void {
    if (this.deps.isDisposed()) {
      return;
    }
    const previous = snapshot(this.deps.getOptions());
    this.merge(partial);

    this.applyBackground(partial, previous);
    const renderAffectingChanges = [
      this.applyExposure(partial),
      this.applyPostEffects(partial, previous),
      this.applyEnvironmentIntensity(partial, previous),
      this.applyAutoRotate(partial, previous),
      this.applyAutoRotateSpeed(partial),
      this.applyAutoplay(partial, previous),
      this.applyAnimationSpeed(partial),
      this.applyPathTracing(partial, previous),
    ];
    this.applyVariant(partial, previous);
    if (renderAffectingChanges.includes(true)) {
      this.deps.repaint();
    }
  }

  private options(): SimpleViewerOptions {
    return this.deps.getOptions();
  }

  private merge(partial: OptionsUpdate): void {
    const merged = deepMerge(this.options(), partial);
    if ('backgroundColorEdge' in partial) {
      merged.backgroundColorEdge = partial.backgroundColorEdge;
    }
    if (partial.renderer && 'colorGrade' in partial.renderer && merged.renderer) {
      merged.renderer.colorGrade = partial.renderer.colorGrade;
    }
    this.deps.setOptions(merged);
  }

  private applyBackground(partial: OptionsUpdate, previous: PreviousOptions): void {
    const options = this.options();
    const backgroundChanged =
      partial.backgroundColor !== undefined || partial.backgroundColorEdge !== undefined;
    if (!backgroundChanged || options.backgroundColor === undefined) {
      return;
    }
    this.deps.environment.applyBackgroundColor(options.backgroundColor);
    const backgroundValueChanged =
      options.backgroundColor !== previous.backgroundColor ||
      options.backgroundColorEdge !== previous.backgroundColorEdge;
    if (backgroundValueChanged && !options.environment?.url) {
      this.deps.pathTracing.resetAccumulation(true);
    }
  }

  private applyExposure(partial: OptionsUpdate): boolean {
    const exposure = partial.renderer?.toneMappingExposure;
    if (exposure === undefined) {
      return false;
    }
    this.deps.renderer.setToneMappingExposure(exposure);
    return true;
  }

  private applyPostEffects(partial: OptionsUpdate, previous: PreviousOptions): boolean {
    const options = this.options();
    if (!partial.renderer || postEffectsKey(options) === previous.postEffects) {
      return false;
    }
    this.deps.renderer.setPostProcessing({
      bloom: options.renderer?.bloom ?? false,
      vignette: options.renderer?.vignette ?? false,
      filmGrain: options.renderer?.filmGrain ?? false,
      colorGrade: options.renderer?.colorGrade ?? false,
    });
    this.deps.pathTracing.resetAccumulation(true);
    return true;
  }

  private applyEnvironmentIntensity(partial: OptionsUpdate, previous: PreviousOptions): boolean {
    const environmentIntensity = partial.environment?.environmentIntensity;
    if (environmentIntensity === undefined) {
      return false;
    }
    this.deps.scene.environmentIntensity = environmentIntensity;
    if (environmentIntensity !== previous.environmentIntensity) {
      this.deps.pathTracing.resetAccumulation(true);
    }
    return true;
  }

  private applyAutoRotate(partial: OptionsUpdate, previous: PreviousOptions): boolean {
    const autoRotate = partial.controls?.autoRotate;
    if (autoRotate === undefined || autoRotate === previous.autoRotate) {
      return false;
    }
    this.deps.controls.autoRotate = autoRotate;
    if (autoRotate) {
      this.deps.renderLoopManager.requireContinuous('turntable');
      this.deps.capture.notifyTurntableEnabled();
    } else {
      this.deps.renderLoopManager.releaseContinuous('turntable');
    }
    return true;
  }

  private applyAutoRotateSpeed(partial: OptionsUpdate): boolean {
    const autoRotateSpeed = partial.controls?.autoRotateSpeed;
    if (autoRotateSpeed === undefined) {
      return false;
    }
    this.deps.controls.autoRotateSpeed = autoRotateSpeed;
    return true;
  }

  private applyAutoplay(partial: OptionsUpdate, previous: PreviousOptions): boolean {
    const autoplay = partial.animations?.autoplay;
    if (autoplay === undefined || autoplay === previous.autoplay) {
      return false;
    }
    if (!autoplay) {
      this.deps.animations.pause();
      return true;
    }
    if (this.deps.hasModel()) {
      this.deps.animations.autoplay(autoplay);
    }
    return true;
  }

  private applyAnimationSpeed(partial: OptionsUpdate): boolean {
    const animationSpeed = partial.animations?.speed;
    if (animationSpeed === undefined) {
      return false;
    }
    this.deps.animations.setSpeed(animationSpeed);
    return true;
  }

  private applyPathTracing(partial: OptionsUpdate, previous: PreviousOptions): boolean {
    const pathTracingEnabled = partial.pathTracing?.enabled;
    if (pathTracingEnabled === undefined || pathTracingEnabled === previous.pathTracingEnabled) {
      return false;
    }
    if (pathTracingEnabled) {
      this.enablePathTracing();
    } else {
      this.disablePathTracing();
    }
    return true;
  }

  private enablePathTracing(): void {
    void this.deps.pathTracing
      .enableRuntime()
      .then((active) => {
        if (active && !this.deps.isDisposed()) {
          this.deps.repaint();
        }
      })
      .catch((error) => {
        if (!this.deps.isDisposed()) {
          this.deps.events.emit('error', {
            error: new ThreeViewerError(
              'Failed to enable path tracing',
              ErrorCode.PATH_TRACING_INIT_FAILED,
              { originalError: error }
            ),
          });
        }
      });
  }

  private disablePathTracing(): void {
    this.deps.pathTracing.disableRuntime();
    this.deps.repaint();
  }

  private applyVariant(partial: OptionsUpdate, previous: PreviousOptions): void {
    if (!('variant' in partial)) {
      return;
    }
    const variant = partial.variant ?? null;
    if (variant !== (previous.variant ?? null)) {
      this.deps.variants.selectOrWarn(variant);
    }
  }
}
