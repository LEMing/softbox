import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { IModelLoader } from './services/IModelLoader';
import { ViewerRenderer, ViewerRendererOptions } from './rendering/ViewerRenderer';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from './events/CoreViewerEvents';
import { resolveUnitsScaleToMeters } from './utils/units';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { IPathTracingService } from './services/IPathTracingService';
import { ISelectionService } from './services/ISelectionService';
import { IAnimationService } from './services/IAnimationService';
import { IEnvironmentService } from './services/IEnvironmentService';
import { ISceneSetupService } from './services/ISceneSetupService';
import { IFloorAlignmentService } from './services/IFloorAlignmentService';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { DisposableTimers } from './utils/DisposableTimers';
import { deepMerge } from '../utils/deepMerge';
import { deferToNextFrame } from './utils/deferToNextFrame';
import { StateManager } from './managers/StateManager';
import { ScreenshotManager } from './managers/ScreenshotManager';
import { ModelManager } from './managers/ModelManager';
import { ResourceManager } from './managers/ResourceManager';
import { PathTracingCoordinator } from './PathTracingCoordinator';
import { CaptureController } from './CaptureController';
import { EnvironmentController } from './EnvironmentController';
import { FrameLoop } from './FrameLoop';
import { ModelLoadQueue } from './ModelLoadQueue';
import { ContactShadowController } from './ContactShadowController';
import { AnimationController } from './AnimationController';
import { MaterialVariantController } from './MaterialVariantController';
import { RuntimeOptionsController } from './RuntimeOptionsController';
import { ViewportResizer } from './ViewportResizer';
import { ScreenshotSwap } from './ScreenshotSwap';

export interface ViewerDependencies {
  renderer: ViewerRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  modelLoader: IModelLoader;
  options: SimpleViewerOptions;
  rendererOptions?: ViewerRendererOptions;
  pathTracingService?: IPathTracingService;
  environmentService?: IEnvironmentService;
  sceneSetupService?: ISceneSetupService;
  floorAlignmentService?: IFloorAlignmentService;
  selectionService?: ISelectionService;
  animationService?: IAnimationService;
  deferToNextFrame?: (callback: () => void) => void;
}

export interface ViewerSharedState {
  getOptions: () => SimpleViewerOptions;
  setOptions: (options: SimpleViewerOptions) => void;
  isDisposed: () => boolean;
}

export interface ViewerCollaborators {
  events: TypedEventEmitter<ViewerEventMap>;
  stateManager: StateManager;
  timers: DisposableTimers;
  renderLoopManager: RenderLoopManager;
  screenshotManager: ScreenshotManager;
  modelManager: ModelManager;
  resourceManager: ResourceManager;
  pathTracing: PathTracingCoordinator;
  frameLoop: FrameLoop;
  capture: CaptureController;
  environment: EnvironmentController;
  animations: AnimationController;
  variants: MaterialVariantController;
  modelLoads: ModelLoadQueue;
  runtimeOptions: RuntimeOptionsController;
  resizer: ViewportResizer;
}

const createRenderLoopManager = (options: SimpleViewerOptions): RenderLoopManager => {
  const renderingOptions = options.rendering || {};
  const defaultIdleDetection = options.staticScene !== false;
  return new RenderLoopManager({
    enableIdleDetection: renderingOptions.enableIdleDetection ?? defaultIdleDetection,
    idleDelay: renderingOptions.idleDelay,
    targetFPS: renderingOptions.targetFPS,
    enableFrameRateLimiting: renderingOptions.enableFrameRateLimiting,
    alwaysRender: false
  });
};

export const wireViewerCollaborators = (
  dependencies: ViewerDependencies,
  shared: ViewerSharedState
): ViewerCollaborators => {
  const { renderer, scene, camera, controls, sceneSetupService, environmentService, animationService } = dependencies;
  const { getOptions, isDisposed } = shared;
  const options = getOptions();
  const repaint = () => frameLoop.repaint();
  const reviveRenderLoop = () => frameLoop.revive();

  const events = new TypedEventEmitter<ViewerEventMap>();
  const stateManager = new StateManager();
  const timers = new DisposableTimers(isDisposed);

  const screenshotManager = new ScreenshotManager({
    renderer,
    onRestore: async () => {
      await screenshotSwap.restoreScene();
    }
  });

  const modelManager = new ModelManager({
    modelLoader: dependencies.modelLoader,
    scene,
    camera,
    controls,
    floorAlignmentService: dependencies.floorAlignmentService,
    sceneSetupService,
    autoFitToObject: options.camera?.autoFitToObject,
    floorAlignment: options.floorAlignment,
    unitsScaleToMeters: resolveUnitsScaleToMeters(options.units)
  });

  const resourceManager = new ResourceManager({
    scene,
    pathTracingService: dependencies.pathTracingService,
    environmentService
  });

  const renderLoopManager = createRenderLoopManager(options);

  const pathTracing = new PathTracingCoordinator({
    service: dependencies.pathTracingService,
    events,
    renderLoopManager,
    renderer,
    getOptions,
    isDisposed,
    schedule: (callback, delayMs) => timers.schedule(callback, delayMs),
    replaceWithScreenshot: () => screenshotSwap.replaceScene(),
  });

  const frameLoop = new FrameLoop({
    renderLoopManager,
    renderer,
    scene,
    camera,
    controls,
    events,
    stateManager,
    pathTracing,
    animationService,
    isScreenshotActive: () => screenshotManager.isActive(),
    isDisposed,
  });

  const capture = new CaptureController({
    renderer,
    scene,
    camera,
    events,
    renderLoopManager,
    pathTracing,
    getStatus: () => stateManager.getStatus(),
    isDisposed,
    awaitModelLoads: () => modelLoads.settled(),
    reviveRenderLoop,
    isAutoRotating: () => controls.autoRotate,
    isScreenshotActive: () => screenshotManager.isActive(),
    finishScheduledShadowBake: () => contactShadows.finishScheduledBake(),
  });

  const environment = new EnvironmentController({
    scene,
    renderLoopManager,
    pathTracing,
    environmentService,
    sceneSetupService,
    getOptions,
    mergeOptions: (partial) => {
      shared.setOptions(deepMerge(getOptions(), partial));
    },
    isDisposed,
    reviveRenderLoop,
  });

  const contactShadows = new ContactShadowController({
    scene,
    renderer,
    sceneSetupService,
    getCurrentModel: () => modelManager.getCurrentModel(),
    isAnimating: (): boolean => animations.isPlaying(),
    isDisposed,
    deferToNextFrame: dependencies.deferToNextFrame ?? deferToNextFrame,
    repaint,
  });

  const animations = new AnimationController({
    animationService,
    renderLoopManager,
    pathTracing,
    contactShadows,
    getOptions,
    repaint,
  });

  const variants = new MaterialVariantController({
    modelManager,
    pathTracing,
    sceneSetupService,
    getOptions,
    isDisposed,
    repaint,
  });

  const modelLoads = new ModelLoadQueue({
    modelManager,
    stateManager,
    events,
    isDisposed,
    onLoaded: (model) => {
      animations.attachTo(model);
      const variant = getOptions().variant;
      if (variant) {
        variants.selectOrWarn(variant);
      }
      repaint();
      pathTracing.resetAccumulation(true);
      contactShadows.scheduleBakeFor(model);
    },
  });

  const runtimeOptions = new RuntimeOptionsController({
    renderer,
    scene,
    controls,
    events,
    renderLoopManager,
    pathTracing,
    capture,
    environment,
    animations,
    variants,
    hasModel: () => Boolean(modelManager.getCurrentModel()),
    getOptions,
    setOptions: shared.setOptions,
    isDisposed,
    repaint,
  });

  const resizer = new ViewportResizer({
    renderer,
    camera,
    pathTracing,
    frameLoop,
    isDisposed,
  });

  const screenshotSwap = new ScreenshotSwap({
    camera,
    controls,
    screenshotManager,
    modelManager,
    resourceManager,
    frameLoop,
    reloadModel: (url) => modelLoads.load(url),
  });

  return {
    events,
    stateManager,
    timers,
    renderLoopManager,
    screenshotManager,
    modelManager,
    resourceManager,
    pathTracing,
    frameLoop,
    capture,
    environment,
    animations,
    variants,
    modelLoads,
    runtimeOptions,
    resizer,
  };
};
