import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ViewerRenderer } from './rendering/ViewerRenderer';
import { AnchorProjector } from './AnchorProjector';
import { Result } from '../utils/Result';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from './events/CoreViewerEvents';
import { ThreeViewerError, ErrorCode } from '../errors';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { CaptureStillOptions } from '../types/CaptureStillOptions';
import { CaptureVideoOptions } from '../types/CaptureVideoOptions';
import { SceneConfigurator } from './SceneConfigurator';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { DisposableTimers } from './utils/DisposableTimers';
import { StateManager } from './managers/StateManager';
import { ScreenshotManager } from './managers/ScreenshotManager';
import { ModelManager } from './managers/ModelManager';
import { ResourceManager } from './managers/ResourceManager';
import { PathTracingCoordinator } from './PathTracingCoordinator';
import { CaptureController } from './CaptureController';
import { EnvironmentController } from './EnvironmentController';
import { FrameLoop } from './FrameLoop';
import { ModelLoadQueue } from './ModelLoadQueue';
import { AnimationController } from './AnimationController';
import { MaterialVariantController } from './MaterialVariantController';
import { RuntimeOptionsController } from './RuntimeOptionsController';
import { ViewportResizer } from './ViewportResizer';
import { ViewerDependencies, wireViewerCollaborators } from './wireViewerCollaborators';
import { ViewerState } from './entities/ViewerState';

export type { CaptureStillOptions, ViewerDependencies };

export class ViewerCore {
  private readonly sceneConfigurator = new SceneConfigurator();
  private readonly events: TypedEventEmitter<ViewerEventMap>;
  private readonly stateManager: StateManager;
  private readonly timers: DisposableTimers;
  private readonly renderLoopManager: RenderLoopManager;
  private readonly screenshotManager: ScreenshotManager;
  private readonly modelManager: ModelManager;
  private readonly resourceManager: ResourceManager;
  private readonly pathTracing: PathTracingCoordinator;
  private readonly frameLoop: FrameLoop;
  private readonly capture: CaptureController;
  private readonly environment: EnvironmentController;
  private readonly animations: AnimationController;
  private readonly variants: MaterialVariantController;
  private readonly modelLoads: ModelLoadQueue;
  private readonly runtimeOptions: RuntimeOptionsController;
  private readonly resizer: ViewportResizer;
  private readonly dependencies: ViewerDependencies;
  private readonly renderer: ViewerRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private options: SimpleViewerOptions;
  private disposed = false;

  constructor(dependencies: ViewerDependencies) {
    this.dependencies = dependencies;
    this.renderer = dependencies.renderer;
    this.scene = dependencies.scene;
    this.camera = dependencies.camera;
    this.controls = dependencies.controls;
    this.options = dependencies.options;

    const collaborators = wireViewerCollaborators(dependencies, {
      getOptions: () => this.options,
      setOptions: (options) => {
        this.options = options;
      },
      isDisposed: () => this.disposed,
    });
    this.events = collaborators.events;
    this.stateManager = collaborators.stateManager;
    this.timers = collaborators.timers;
    this.renderLoopManager = collaborators.renderLoopManager;
    this.screenshotManager = collaborators.screenshotManager;
    this.modelManager = collaborators.modelManager;
    this.resourceManager = collaborators.resourceManager;
    this.pathTracing = collaborators.pathTracing;
    this.frameLoop = collaborators.frameLoop;
    this.capture = collaborators.capture;
    this.environment = collaborators.environment;
    this.animations = collaborators.animations;
    this.variants = collaborators.variants;
    this.modelLoads = collaborators.modelLoads;
    this.runtimeOptions = collaborators.runtimeOptions;
    this.resizer = collaborators.resizer;
  }

  async initialize(): Promise<Result<void>> {
    try {
      this.renderer.setPostProcessingErrorHandler((error) => this.reportPostProcessingFailure(error));
      const rendererResult = this.renderer.initialize(this.dependencies.rendererOptions || {});
      if (!rendererResult.ok) {
        return rendererResult;
      }

      const { sceneSetupService, environmentService } = this.dependencies;
      if (sceneSetupService) {
        this.sceneConfigurator.configureScene(this.scene, sceneSetupService, this.options);
      }

      if (environmentService) {
        await this.sceneConfigurator.configureEnvironment(
          this.scene,
          environmentService,
          sceneSetupService,
          this.renderer,
          this.options,
          () => this.disposed
        );
        if (this.disposed) {
          return Result.ok(undefined);
        }
      }

      await this.pathTracing.initialize();
      if (this.disposed) {
        return Result.ok(undefined);
      }

      this.bindSelection();

      this.stateManager.setInitialized();
      this.frameLoop.start();
      this.frameLoop.wakeOnControlsChange();
      this.requireInitialContinuousRendering();
      this.renderLoopManager.requestRender();

      return Result.ok(undefined);
    } catch (error) {
      const viewerError = new ThreeViewerError(
        'Failed to initialize viewer',
        ErrorCode.INITIALIZATION_FAILED,
        { originalError: error }
      );
      this.stateManager.setError(viewerError);
      this.events.emit('error', { error: viewerError });
      return Result.err(viewerError);
    }
  }

  private reportPostProcessingFailure(error: unknown): void {
    if (this.disposed) {
      return;
    }
    this.events.emit('error', {
      error: new ThreeViewerError(
        'Post-processing effects failed to load; rendering without them',
        ErrorCode.POST_PROCESSING_FAILED,
        { originalError: error }
      ),
    });
  }

  private bindSelection(): void {
    this.dependencies.selectionService?.initialize({
      canvas: this.renderer.getDomElement(),
      camera: this.camera,
      getPickRoot: () => this.modelManager.getCurrentModel(),
      bvh: this.options.selection?.bvh,
      onPick: (pick) => {
        if (pick && !this.disposed) {
          this.events.emit('object:selected', pick);
        }
      },
    });
  }

  private requireInitialContinuousRendering(): void {
    if (!this.options.staticScene) {
      this.renderLoopManager.setAlwaysRender(true);
    } else if (this.pathTracing.isEnabled()) {
      this.renderLoopManager.requireContinuous('path-tracing');
    }
    if (this.options.controls?.autoRotate) {
      this.renderLoopManager.requireContinuous('turntable');
    }
  }

  loadModel(source: string | THREE.Object3D): Promise<Result<void>> {
    return this.modelLoads.load(source);
  }

  updateOptions(partial: Partial<SimpleViewerOptions>): void {
    this.runtimeOptions.apply(partial);
  }

  setEnvironmentMap(url: string): Promise<Result<void>> {
    return this.environment.setEnvironmentMap(url);
  }

  resetEnvironment(): Result<void> {
    return this.environment.resetEnvironment();
  }

  setBackgroundImage(source: string | File | HTMLImageElement): Promise<Result<void>> {
    return this.environment.setBackgroundImage(source);
  }

  setBackgroundColor(color: string | number): Result<void> {
    return this.environment.setBackgroundColor(color);
  }

  resize(width: number, height: number): void {
    this.resizer.resize(width, height);
  }

  getState() {
    return this.stateManager.getState();
  }

  onStateChange(callback: (state: ViewerState) => void): () => void {
    return this.stateManager.onStateChange(callback);
  }

  getEvents(): TypedEventEmitter<ViewerEventMap> {
    return this.events;
  }

  getDomElement(): HTMLCanvasElement {
    return this.renderer.getDomElement();
  }

  getRenderer(): ViewerRenderer {
    return this.renderer;
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getControls(): OrbitControls {
    return this.controls;
  }

  getModel(): THREE.Object3D | null {
    return this.modelManager.getCurrentModel();
  }

  requestRender(): void {
    this.renderLoopManager.requestRender();
  }

  getAnimationNames(): string[] {
    return this.animations.getClipNames();
  }

  getVariantNames(): string[] {
    return this.variants.getNames();
  }

  getModelUrl(): string | null {
    return this.modelManager.getCurrentModelUrl();
  }

  setMaterialVariant(variant: string | null): Result<void> {
    return this.variants.select(variant);
  }

  playAnimations(clipName?: string): Result<void> {
    return this.animations.play(clipName);
  }

  pauseAnimations(): void {
    this.animations.pause();
  }

  createAnchorProjector(): AnchorProjector {
    return new AnchorProjector({
      camera: this.camera,
      getCanvas: () => this.renderer.getDomElement(),
      getModel: () => this.getModel(),
    });
  }

  captureStill(options: CaptureStillOptions = {}): Promise<Result<string>> {
    return this.capture.captureStill(options);
  }

  captureVideo(options: CaptureVideoOptions = {}): Promise<Result<Blob>> {
    return this.capture.captureVideo(options);
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    this.disposed = true;

    this.timers.cancelAll();

    this.frameLoop.dispose();
    this.dependencies.selectionService?.dispose();
    this.animations.detach();

    this.modelManager.dispose();
    this.resourceManager.dispose();
    this.screenshotManager.dispose();
    this.controls.dispose();
    this.renderer.dispose();

    this.stateManager.setDisposed();

    this.capture.settleOnDispose();

    this.events.removeAllListeners();
    this.stateManager.clearCallbacks();
  }
}
