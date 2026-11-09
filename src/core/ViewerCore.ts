import {
  IRenderer,
  IRendererOptions,
  IScene,
  IModelLoader,
  ICamera,
  IPerspectiveCamera,
  IControls,
  IObject3D,
  IAnchorProjectionService,
  IAnchorProjector,
  Result
} from './interfaces';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from './events/CoreViewerEvents';
import { ThreeViewerError, ErrorCode } from '../errors';
import { resolveUnitsScaleToMeters } from './utils/units';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { CaptureStillOptions } from '../types/CaptureStillOptions';
import { CaptureVideoOptions } from '../types/CaptureVideoOptions';
import { IPathTracingService } from './services/IPathTracingService';
import { ISelectionService } from './services/ISelectionService';
import { IAnimationService } from './services/IAnimationService';
import { IEnvironmentService } from './services/IEnvironmentService';
import { ISceneSetupService } from './services/ISceneSetupService';
import { SceneConfigurator } from './SceneConfigurator';
import { IFloorAlignmentService } from './services/IFloorAlignmentService';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { deepMerge } from '../utils/deepMerge';
import { deferToNextFrame } from './utils/deferToNextFrame';
import { SceneSerializer } from './utils/SceneSerializer';
import { applyCameraAspect } from './utils/cameraAspect';
import { StateManager } from './managers/StateManager';
import { ScreenshotManager } from './managers/ScreenshotManager';
import { ModelManager } from './managers/ModelManager';
import { ResourceManager } from './managers/ResourceManager';
import { PathTracingCoordinator } from './PathTracingCoordinator';
import { CaptureController } from './CaptureController';
import { EnvironmentController } from './EnvironmentController';
import { ViewerState } from './entities/ViewerState';
import { bestEffort } from '../utils/bestEffort';

export type { CaptureStillOptions };

export interface ViewerDependencies {
  renderer: IRenderer;
  scene: IScene;
  camera: ICamera;
  controls: IControls;
  modelLoader: IModelLoader;
  options: SimpleViewerOptions;
  rendererOptions?: IRendererOptions;
  pathTracingService?: IPathTracingService;
  environmentService?: IEnvironmentService;
  sceneSetupService?: ISceneSetupService;
  floorAlignmentService?: IFloorAlignmentService;
  selectionService?: ISelectionService;
  anchorProjectionService?: IAnchorProjectionService;
  animationService?: IAnimationService;
  deferToNextFrame?: (callback: () => void) => void;
}

export class ViewerCore {
  private readonly events: TypedEventEmitter<ViewerEventMap>;
  private readonly renderLoopManager: RenderLoopManager;
  private frameCount: number = 0;
  private disposed: boolean = false;
  private readonly pendingTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  private modelLoadChain: Promise<unknown> = Promise.resolve();

  private readonly stateManager: StateManager;
  private readonly screenshotManager: ScreenshotManager;
  private readonly modelManager: ModelManager;
  private readonly resourceManager: ResourceManager;
  private readonly sceneConfigurator: SceneConfigurator;
  private readonly pathTracing: PathTracingCoordinator;
  private readonly capture: CaptureController;
  private readonly environment: EnvironmentController;
  private controlsChangeUnsubscribe: (() => void) | null = null;

  private readonly renderer: IRenderer;
  private readonly scene: IScene;
  private readonly camera: ICamera;
  private readonly controls: IControls;
  private options: SimpleViewerOptions;
  private readonly rendererOptions?: IRendererOptions;
  private readonly sceneSetupService?: ISceneSetupService;
  private readonly environmentService?: IEnvironmentService;
  private readonly selectionService?: ISelectionService;
  private readonly anchorProjectionService?: IAnchorProjectionService;
  private readonly animationService?: IAnimationService;
  private readonly deferToNextFrame: (callback: () => void) => void;

  constructor(dependencies: ViewerDependencies) {
    this.renderer = dependencies.renderer;
    this.scene = dependencies.scene;
    this.camera = dependencies.camera;
    this.controls = dependencies.controls;
    this.options = dependencies.options;
    this.rendererOptions = dependencies.rendererOptions;
    this.sceneSetupService = dependencies.sceneSetupService;
    this.environmentService = dependencies.environmentService;
    this.selectionService = dependencies.selectionService;
    this.anchorProjectionService = dependencies.anchorProjectionService;
    this.animationService = dependencies.animationService;
    this.deferToNextFrame = dependencies.deferToNextFrame ?? deferToNextFrame;

    this.stateManager = new StateManager();

    this.screenshotManager = new ScreenshotManager({
      renderer: this.renderer,
      onRestore: async () => {
        await this.restoreFromScreenshot();
      }
    });

    const unitsScaleToMeters = resolveUnitsScaleToMeters(this.options.units);

    this.modelManager = new ModelManager({
      modelLoader: dependencies.modelLoader,
      scene: this.scene,
      camera: this.camera,
      controls: this.controls,
      floorAlignmentService: dependencies.floorAlignmentService,
      sceneSetupService: this.sceneSetupService,
      autoFitToObject: this.options.camera?.autoFitToObject,
      floorAlignment: this.options.floorAlignment,
      unitsScaleToMeters
    });

    this.resourceManager = new ResourceManager({
      scene: this.scene,
      pathTracingService: dependencies.pathTracingService,
      environmentService: this.environmentService
    });

    this.sceneConfigurator = new SceneConfigurator();

    this.events = new TypedEventEmitter<ViewerEventMap>();

    const renderingOptions = this.options.rendering || {};
    const defaultIdleDetection = this.options.staticScene !== false;

    this.renderLoopManager = new RenderLoopManager({
      enableIdleDetection: renderingOptions.enableIdleDetection ?? defaultIdleDetection,
      idleDelay: renderingOptions.idleDelay,
      targetFPS: renderingOptions.targetFPS,
      enableFrameRateLimiting: renderingOptions.enableFrameRateLimiting,
      alwaysRender: false
    });

    this.pathTracing = new PathTracingCoordinator({
      service: dependencies.pathTracingService,
      events: this.events,
      renderLoopManager: this.renderLoopManager,
      renderer: this.renderer,
      getOptions: () => this.options,
      isDisposed: () => this.disposed,
      schedule: (callback, delayMs) => this.schedule(callback, delayMs),
      replaceWithScreenshot: () => this.replaceWithScreenshot(),
    });

    this.capture = new CaptureController({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      events: this.events,
      renderLoopManager: this.renderLoopManager,
      pathTracing: this.pathTracing,
      getStatus: () => this.stateManager.getStatus(),
      isDisposed: () => this.disposed,
      awaitModelLoads: () => this.modelLoadChain,
      reviveRenderLoop: () => this.reviveRenderLoop(),
      isAutoRotating: () => this.controls.autoRotate,
      isScreenshotActive: () => this.screenshotManager.isActive(),
    });

    this.environment = new EnvironmentController({
      scene: this.scene,
      renderLoopManager: this.renderLoopManager,
      pathTracing: this.pathTracing,
      environmentService: this.environmentService,
      sceneSetupService: this.sceneSetupService,
      getOptions: () => this.options,
      mergeOptions: (partial) => {
        this.options = deepMerge(this.options, partial);
      },
      isDisposed: () => this.disposed,
      reviveRenderLoop: () => this.reviveRenderLoop(),
    });
  }

  async initialize(): Promise<Result<void>> {
    try {
      this.renderer.setPostProcessingErrorHandler?.((error) => {
        if (!this.disposed) {
          this.events.emit('error', {
            error: new ThreeViewerError(
              'Post-processing effects failed to load; rendering without them',
              ErrorCode.POST_PROCESSING_FAILED,
              { originalError: error }
            ),
          });
        }
      });
      const rendererResult = this.renderer.initialize(this.rendererOptions || {});
      if (!rendererResult.ok) {
        return rendererResult;
      }

      if (this.sceneSetupService) {
        this.sceneConfigurator.configureScene(this.scene, this.sceneSetupService, this.options);
      }

      if (this.environmentService) {
        await this.sceneConfigurator.configureEnvironment(
          this.scene,
          this.environmentService,
          this.sceneSetupService,
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

      if (this.selectionService) {
        this.selectionService.initialize({
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

      this.stateManager.setInitialized();
      this.startRenderLoop();

      this.controlsChangeUnsubscribe = this.controls.onChange(() => {
        if (this.disposed) {
          return;
        }
        this.reviveRenderLoop();
        this.renderLoopManager.requestRender();
      });

      if (!this.options.staticScene) {
        this.renderLoopManager.setAlwaysRender(true);
      } else if (this.pathTracing.isEnabled()) {
        this.renderLoopManager.requireContinuous('path-tracing');
      }
      if (this.options.controls?.autoRotate) {
        this.renderLoopManager.requireContinuous('turntable');
      }

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

  loadModel(source: string | IObject3D): Promise<Result<void>> {
    const run = this.modelLoadChain.then(() => this.runLoadModel(source));
    this.modelLoadChain = run.then(() => undefined, () => undefined);
    return run;
  }

  private async runLoadModel(source: string | IObject3D): Promise<Result<void>> {
    if (this.disposed) {
      return Result.err(
        new ThreeViewerError('Cannot load model after dispose', ErrorCode.INVALID_STATE)
      );
    }
    if (!this.stateManager.canLoad()) {
      return Result.err(
        new ThreeViewerError(
          'Cannot load model in current state',
          ErrorCode.INVALID_STATE,
          {
            currentState: this.stateManager.getStatus(),
            isInitialized: this.stateManager.isInitialized()
          }
        )
      );
    }

    try {
      this.stateManager.startLoading();

      const result = await this.modelManager.loadModel(source, this.events);

      if (this.disposed) {
        if (result.ok) {
          this.modelManager.disposeCurrentModel();
        }
        return Result.err(
          new ThreeViewerError('Viewer was disposed while the model was loading', ErrorCode.INVALID_STATE)
        );
      }

      if (result.ok) {
        this.stateManager.setLoaded(result.value);
        this.attachAnimations(result.value);
        if (this.options.variant) {
          this.applyVariantOrWarn(this.options.variant);
        }
        this.reviveRenderLoop();
        this.renderLoopManager.requestRender();
        this.pathTracing.resetAccumulation(true);
        this.scheduleContactShadowBake(result.value);
        return Result.ok(undefined);
      } else {
        this.stateManager.setError(result.error);
        return result;
      }
    } catch (error) {
      const viewerError = error instanceof ThreeViewerError ? error :
        new ThreeViewerError(
          'Failed to load model',
          ErrorCode.MODEL_LOAD_FAILED,
          { originalError: error, source }
        );

      this.stateManager.setError(viewerError);
      return Result.err(viewerError);
    }
  }

  private startRenderLoop(): void {
    this.renderLoopManager.start((deltaTime) => {
      if (this.disposed) {
        this.renderLoopManager.stop();
        return;
      }
      if (!this.stateManager.isInitialized() || this.stateManager.getStatus() === 'error') {
        return;
      }
      if (!this.renderer || this.renderer.isDisposed()) {
        this.renderLoopManager.stop();
        return;
      }

      const currentTime = performance.now();
      const fps = deltaTime > 0 ? 1000 / deltaTime : 0;

      const isAnimating = this.animationService?.isPlaying() ?? false;
      const controlsChanged = this.controls.enabled ? this.controls.update() : false;
      if (controlsChanged) {
        this.events.emit('controls:change', { controls: this.controls });
        if (!isAnimating) {
          this.pathTracing.resetAccumulation();
        }
        this.renderLoopManager.requestRender();
      }

      if (isAnimating && this.animationService) {
        this.animationService.update(deltaTime / 1000);
        this.pathTracing.suspendWhileAnimating();
      }

      const frameState = this.pathTracing.beforeFrame();

      this.renderFrame().catch(error => {
        console.error('[ViewerCore] Render frame error:', error);
      });

      this.pathTracing.detectCompletion(frameState, currentTime);

      this.frameCount++;
      this.stateManager.updateRenderInfo({
        frameCount: this.frameCount,
        fps: Math.round(fps),
        lastRenderTime: performance.now() - currentTime,
      });
    });
  }

  private stopRenderLoop(): void {
    this.renderLoopManager.stop();
  }

  private schedule(callback: () => void, delayMs: number): void {
    const id = setTimeout(() => {
      this.pendingTimers.delete(id);
      if (this.disposed) {
        return;
      }
      callback();
    }, delayMs);
    this.pendingTimers.add(id);
  }

  private async renderFrame(): Promise<void> {
    const startTime = performance.now();

    if (!this.renderer || !this.scene || !this.camera) {
      console.warn('[ViewerCore] Cannot render - components not initialized');
      return;
    }
    if (this.screenshotManager.isActive()) {
      return;
    }

    this.stateManager.startRendering();

    const renderResult = await (
      this.pathTracing.render(this.scene, this.camera) ??
      Promise.resolve(this.renderRaster())
    );

    if (!renderResult.ok) {
      console.error('[ViewerCore] Render failed:', renderResult.error);
      this.events.emit('error', { error: renderResult.error });
      return;
    }

    this.events.emit('render:complete', {
      frame: this.frameCount,
      renderTime: performance.now() - startTime,
      samples: this.pathTracing.getSampleCount()
    });
  }

  private renderRaster(): Result<void> {
    return this.renderer.renderPostProcessed
      ? this.renderer.renderPostProcessed(this.scene, this.camera)
      : this.renderer.render(this.scene, this.camera);
  }

  updateOptions(partial: Partial<SimpleViewerOptions>): void {
    if (this.disposed) {
      return;
    }
    const previousAutoplay = this.options.animations?.autoplay;
    const previousAutoRotate = this.options.controls?.autoRotate;
    const previousPathTracingEnabled = this.options.pathTracing?.enabled ?? false;
    const previousPostEffects = ViewerCore.postEffectsKey(this.options);
    const previousBackgroundColor = this.options.backgroundColor;
    const previousBackgroundColorEdge = this.options.backgroundColorEdge;
    const previousEnvironmentIntensity = this.options.environment?.environmentIntensity;
    const previousVariant = this.options.variant;
    this.options = deepMerge(this.options, partial);
    if ('backgroundColorEdge' in partial) {
      this.options.backgroundColorEdge = partial.backgroundColorEdge;
    }
    if (partial.renderer && 'colorGrade' in partial.renderer && this.options.renderer) {
      this.options.renderer.colorGrade = partial.renderer.colorGrade;
    }

    let needsRender = false;
    const backgroundChanged =
      partial.backgroundColor !== undefined || partial.backgroundColorEdge !== undefined;
    if (backgroundChanged && this.options.backgroundColor !== undefined) {
      this.environment.applyBackgroundColor(this.options.backgroundColor);
      const backgroundValueChanged =
        this.options.backgroundColor !== previousBackgroundColor ||
        this.options.backgroundColorEdge !== previousBackgroundColorEdge;
      if (backgroundValueChanged && !this.options.environment?.url) {
        this.pathTracing.resetAccumulation(true);
      }
    }
    const exposure = partial.renderer?.toneMappingExposure;
    if (exposure !== undefined) {
      this.renderer.setToneMappingExposure(exposure);
      needsRender = true;
    }
    const nextPostEffects = ViewerCore.postEffectsKey(this.options);
    if (
      partial.renderer &&
      nextPostEffects !== previousPostEffects &&
      this.renderer.setPostProcessing
    ) {
      this.renderer.setPostProcessing({
        bloom: this.options.renderer?.bloom ?? false,
        vignette: this.options.renderer?.vignette ?? false,
        filmGrain: this.options.renderer?.filmGrain ?? false,
        colorGrade: this.options.renderer?.colorGrade ?? false,
      });
      this.pathTracing.resetAccumulation(true);
      needsRender = true;
    }
    const environmentIntensity = partial.environment?.environmentIntensity;
    if (environmentIntensity !== undefined) {
      this.scene.setEnvironmentIntensity(environmentIntensity);
      if (environmentIntensity !== previousEnvironmentIntensity) {
        this.pathTracing.resetAccumulation(true);
      }
      needsRender = true;
    }
    const autoRotate = partial.controls?.autoRotate;
    if (autoRotate !== undefined && autoRotate !== previousAutoRotate) {
      this.controls.autoRotate = autoRotate;
      if (autoRotate) {
        this.renderLoopManager.requireContinuous('turntable');
        this.capture.notifyTurntableEnabled();
      } else {
        this.renderLoopManager.releaseContinuous('turntable');
      }
      needsRender = true;
    }
    const autoRotateSpeed = partial.controls?.autoRotateSpeed;
    if (autoRotateSpeed !== undefined) {
      this.controls.autoRotateSpeed = autoRotateSpeed;
      needsRender = true;
    }
    const autoplay = partial.animations?.autoplay;
    if (autoplay !== undefined && autoplay !== previousAutoplay) {
      if (autoplay) {
        if (this.modelManager.getCurrentModel()) {
          this.autoplayFromOptions(autoplay);
        }
      } else {
        this.pauseAnimations();
      }
      needsRender = true;
    }
    const animationSpeed = partial.animations?.speed;
    if (animationSpeed !== undefined) {
      this.animationService?.setSpeed(animationSpeed);
      needsRender = true;
    }
    const pathTracingEnabled = partial.pathTracing?.enabled;
    if (pathTracingEnabled !== undefined && pathTracingEnabled !== previousPathTracingEnabled) {
      this.setPathTracingEnabled(pathTracingEnabled);
      needsRender = true;
    }
    if ('variant' in partial) {
      const variant = partial.variant ?? null;
      if (variant !== (previousVariant ?? null)) {
        this.applyVariantOrWarn(variant);
      }
    }
    if (needsRender) {
      this.reviveRenderLoop();
      this.renderLoopManager.requestRender();
    }
  }

  private static postEffectsKey(options: SimpleViewerOptions): string {
    const renderer = options.renderer;
    return JSON.stringify([
      renderer?.bloom ?? false,
      renderer?.vignette ?? false,
      renderer?.filmGrain ?? false,
      renderer?.colorGrade ?? false,
    ]);
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
    if (this.disposed) {
      return;
    }
    const targetAspect = width / height;
    const canvas = this.renderer.getDomElement();
    const pixelRatio = this.renderer.getPixelRatio();
    const sizeMatches =
      canvas.width === Math.floor(width * pixelRatio) &&
      canvas.height === Math.floor(height * pixelRatio);
    const perspectiveAspect =
      this.camera.type === 'perspective' && 'aspect' in this.camera
        ? (this.camera as IPerspectiveCamera).aspect
        : null;
    const aspectMatches =
      perspectiveAspect === null || Math.abs(perspectiveAspect - targetAspect) < 1e-6;
    if (sizeMatches && aspectMatches) {
      return;
    }

    applyCameraAspect(this.camera, targetAspect);
    if (!sizeMatches) {
      this.renderer.setSize(width, height);
    }

    bestEffort(() => this.renderRaster());

    this.pathTracing.resetAccumulation();
    this.reviveRenderLoop();
    this.renderLoopManager.requestRender();
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

  getRenderer(): IRenderer {
    return this.renderer;
  }

  getScene(): IScene {
    return this.scene;
  }

  getCamera(): ICamera {
    return this.camera;
  }

  getControls(): IControls {
    return this.controls;
  }

  getModel(): IObject3D | null {
    return this.modelManager.getCurrentModel();
  }

  requestRender(): void {
    this.renderLoopManager.requestRender();
  }

  private reviveRenderLoop(): void {
    if (this.stateManager.isInitialized() && !this.renderLoopManager.isRunning()) {
      this.startRenderLoop();
    }
  }

  private setPathTracingEnabled(enabled: boolean): void {
    if (enabled) {
      void this.pathTracing
        .enableRuntime()
        .then((active) => {
          if (active && !this.disposed) {
            this.reviveRenderLoop();
            this.renderLoopManager.requestRender();
          }
        })
        .catch((error) => {
          if (!this.disposed) {
            this.events.emit('error', {
              error: new ThreeViewerError(
                'Failed to enable path tracing',
                ErrorCode.PATH_TRACING_INIT_FAILED,
                { originalError: error }
              ),
            });
          }
        });
    } else {
      this.pathTracing.disableRuntime();
      this.reviveRenderLoop();
      this.renderLoopManager.requestRender();
    }
  }

  getAnimationNames(): string[] {
    return this.animationService?.getClipNames() ?? [];
  }

  getVariantNames(): string[] {
    return this.modelManager.getVariantNames();
  }

  getModelUrl(): string | null {
    return this.modelManager.getCurrentModelUrl();
  }

  setMaterialVariant(variant: string | null): Result<void> {
    const model = this.modelManager.getCurrentModel();
    if (model && variant !== null && !this.modelManager.getVariantNames().includes(variant)) {
      return Result.err(
        new ThreeViewerError(
          `Unknown material variant '${variant}'`,
          ErrorCode.INVALID_PARAMETER
        )
      );
    }
    this.options.variant = variant ?? undefined;
    if (!model || !this.sceneSetupService) {
      return Result.ok(undefined);
    }
    void this.sceneSetupService.applyMaterialVariant(model, variant).then((applied) => {
      if (!applied.ok) {
        console.warn('Failed to apply material variant:', applied.error);
        return;
      }
      const stale = this.disposed || this.modelManager.getCurrentModel() !== model;
      if (!applied.value || stale) {
        return;
      }
      this.pathTracing.resetAccumulation(true);
      this.reviveRenderLoop();
      this.renderLoopManager.requestRender();
    });
    return Result.ok(undefined);
  }

  private applyVariantOrWarn(variant: string | null): void {
    const result = this.setMaterialVariant(variant);
    if (!result.ok) {
      console.warn('Failed to apply material variant:', result.error);
    }
  }

  playAnimations(clipName?: string): Result<void> {
    if (!this.animationService) {
      if (clipName !== undefined) {
        return Result.err(
          new ThreeViewerError(
            `Cannot play animation clip '${clipName}': the viewer was assembled without an animation service`,
            ErrorCode.INVALID_STATE
          )
        );
      }
      return Result.ok(undefined);
    }
    const played = this.animationService.play(clipName);
    if (!played.ok) {
      return played;
    }
    if (this.animationService.isPlaying()) {
      this.sceneSetupService?.setContactShadowMode(this.scene, 'live');
      this.renderLoopManager.requireContinuous('animations');
      this.reviveRenderLoop();
      this.renderLoopManager.requestRender();
    }
    return Result.ok(undefined);
  }

  private autoplayFromOptions(autoplay: boolean | string): void {
    const played = this.playAnimations(typeof autoplay === 'string' ? autoplay : undefined);
    if (!played.ok) {
      console.error('animations.autoplay failed:', played.error.message);
    }
  }

  pauseAnimations(): void {
    this.animationService?.pause();
    this.renderLoopManager.releaseContinuous('animations');
    this.rebakeContactShadowForCurrentPose();
    this.pathTracing.resetAccumulation(true);
    this.renderLoopManager.requestRender();
  }

  private rebakeContactShadowForCurrentPose(): void {
    const model = this.modelManager.getCurrentModel();
    if (!model || !this.sceneSetupService) {
      return;
    }
    const bakeResult = this.sceneSetupService.bakeContactShadow(this.scene, model, this.renderer);
    if (!bakeResult.ok) {
      console.warn('Failed to bake contact shadow:', bakeResult.error);
    }
  }

  private scheduleContactShadowBake(model: IObject3D): void {
    this.deferToNextFrame(() => {
      if (
        this.disposed ||
        this.modelManager.getCurrentModel() !== model ||
        this.animationService?.isPlaying()
      ) {
        return;
      }
      this.rebakeContactShadowForCurrentPose();
      this.reviveRenderLoop();
      this.renderLoopManager.requestRender();
    });
  }

  private attachAnimations(model: IObject3D): void {
    if (!this.animationService) {
      return;
    }
    this.renderLoopManager.releaseContinuous('animations');
    this.animationService.attach(model);
    const animationOptions = this.options.animations;
    if (animationOptions?.speed !== undefined) {
      this.animationService.setSpeed(animationOptions.speed);
    }
    const autoplay = animationOptions?.autoplay;
    if (autoplay) {
      this.autoplayFromOptions(autoplay);
    }
  }

  createAnchorProjector(): IAnchorProjector | null {
    if (!this.anchorProjectionService) {
      return null;
    }
    return this.anchorProjectionService.createProjector({
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

  private replaceWithScreenshot(): void {
    const lastModelUrl = this.modelManager.getLastModelUrl();

    this.screenshotManager.captureAndReplace(
      this.camera,
      this.controls,
      lastModelUrl,
      () => {
        this.modelManager.disposeCurrentModel();
        this.resourceManager.disposeSceneResources(true);
      }
    );
  }

  private async restoreFromScreenshot(): Promise<void> {
    const serializedState = this.screenshotManager.getSerializedState();

    if (serializedState) {
      await SceneSerializer.restore(
        serializedState,
        this.camera,
        this.controls,
        async (url) => {
          const result = await this.loadModel(url);
          if (!result.ok) {
            console.error('[ViewerCore] Failed to reload model:', result.error);
          }
        }
      );
    }

    if (!this.renderLoopManager.isRunning()) {
      this.startRenderLoop();
    }
    this.renderLoopManager.requestRender();
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    this.disposed = true;

    this.pendingTimers.forEach((id) => clearTimeout(id));
    this.pendingTimers.clear();

    this.stopRenderLoop();
    this.controlsChangeUnsubscribe?.();
    this.controlsChangeUnsubscribe = null;
    this.selectionService?.dispose();
    this.animationService?.detach();

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
