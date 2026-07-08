import { ViewerCore, ViewerDependencies } from '../../core/ViewerCore';
import { resolveUnitsScaleToMeters } from '../../core/utils/units';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import { 
  ThreeRendererAdapter,
  ThreeSceneAdapter,
  ThreePerspectiveCameraAdapter,
  ThreeOrbitControlsAdapter,
  ThreeMapControlsAdapter,
  ModelLoaderFactory,
  GLTFLoaderConfig,
  LazyPathTracingService,
  ThreeEnvironmentService,
  ThreeSceneSetupService,
  ThreeFloorAlignmentService,
  ThreeSelectionService,
  ThreeAnchorProjectionService,
  ThreeAnimationService
} from '../three';
import { ControlType } from '../../types/options';
import { RendererOptionsConverter } from '../converters/RendererOptionsConverter';
import * as THREE from 'three';

/**
 * Factory for creating ViewerCore with all dependencies
 */
export class ViewerFactory {
  /**
   * Create a ViewerCore instance with Three.js implementations
   */
  static createViewer(
    canvas: HTMLCanvasElement,
    options: SimpleViewerOptions
  ): ViewerCore {
    // Reject invalid options before any resource exists: a throw below this
    // line would leak the controls' DOM listeners and the adapter graph, since
    // no ViewerCore ever materializes to dispose them.
    resolveUnitsScaleToMeters(options.units);

    // Create renderer
    const renderer = new ThreeRendererAdapter(canvas);
    
    // Create scene
    const scene = new ThreeSceneAdapter();
    
    // Create camera
    const camera = this.createCamera(options);
    
    // Create controls
    const controls = this.createControls(
      camera.getThreeCamera(),
      canvas,
      options
    );
    
    // Create model loader with compression decoders (DRACO/KTX2/Meshopt). The
    // renderer is passed so KTX2 can detect GPU-supported texture formats.
    const modelLoader = new ExtendedModelLoaderFactory().createDefaultLoader({
      renderer: renderer.getThreeRenderer() ?? undefined,
      bvh: options.selection?.bvh,
      ...options.loaders,
    });
    
    // Create scene setup service
    const sceneSetupService = new ThreeSceneSetupService();
    
    // Create environment service
    const environmentService = new ThreeEnvironmentService();
    
    // Always create the tracer service — it's a lazy facade (the heavy
    // three-gpu-pathtracer chunk loads only on the first initialize()), so a
    // viewer that boots with path tracing off can still turn it on at runtime
    // (updateOptions) without a rebuild or a model refetch.
    const pathTracingService = new LazyPathTracingService();

    // Create floor alignment service
    const floorAlignmentService = new ThreeFloorAlignmentService();

    // Create click-picking service (drives the object:selected event)
    const selectionService = new ThreeSelectionService();

    // Create anchor projection service (drives DOM annotations like Hotspot)
    const anchorProjectionService = new ThreeAnchorProjectionService();

    // Create animation service (GLTF clip playback)
    const animationService = new ThreeAnimationService();
    
    // Convert renderer options
    const rendererOptions = RendererOptionsConverter.convertRendererOptions(
      (options.renderer || {}) as Record<string, unknown>
    );

    // Preserve the WebGL drawing buffer so a completed path-traced frame
    // persists on the canvas after the render loop stops: captureStill reads
    // it back via canvas.toDataURL(), and without screenshot replacement the
    // final frame stays on the canvas (no DOM overlay), which only survives
    // compositing when preserved. Path tracing can now be enabled at runtime on
    // any viewer, so this must be on unconditionally rather than gated on the
    // boot-time flag. The cost is a per-rendered-frame buffer copy — negligible
    // for idle viewers (an e-commerce grid renders nothing while at rest).
    rendererOptions.preserveDrawingBuffer = true;
    
    // Create dependencies object
    const dependencies: ViewerDependencies = {
      renderer,
      scene,
      camera,
      controls,
      modelLoader,
      options,
      rendererOptions,
      sceneSetupService,
      environmentService,
      pathTracingService,
      floorAlignmentService,
      selectionService,
      anchorProjectionService,
      animationService
    };
    
    // Create and return ViewerCore
    return new ViewerCore(dependencies);
  }
  
  private static createCamera(options: SimpleViewerOptions): ThreePerspectiveCameraAdapter {
    const cameraOptions = options.camera || {};
    
    // Convert old format to new format
    const legacyOptions = cameraOptions as { 
      fov?: number; 
      cameraFov?: number;
      near?: number;
      cameraNear?: number;
      far?: number;
      cameraFar?: number;
      position?: [number, number, number];
      cameraPosition?: [number, number, number];
      target?: [number, number, number];
      cameraTarget?: [number, number, number];
    };
    
    // 45° matches the defaultOptions.camera.fov and a product/Sketchfab-style
    // flatter perspective; the fallback only applies if camera options are
    // cleared entirely.
    const fov = legacyOptions.fov || legacyOptions.cameraFov || 30;
    const near = legacyOptions.near || legacyOptions.cameraNear || 0.1;
    const far = legacyOptions.far || legacyOptions.cameraFar || 100000;
    const position = legacyOptions.position || legacyOptions.cameraPosition;
    const target = legacyOptions.target || legacyOptions.cameraTarget;
    
    const camera = ThreePerspectiveCameraAdapter.create(
      fov,
      1, // Aspect ratio will be set by resize
      near,
      far
    );
    
    // Set position
    if (position) {
      camera.position.set(
        position[0],
        position[1],
        position[2]
      );
    }
    
    // Set target
    if (target) {
      camera.lookAt({
        x: target[0],
        y: target[1],
        z: target[2],
        set: () => {},
        copy: () => {},
        add: () => {},
        multiply: () => {},
        normalize: () => {},
        length: () => 0
      });
    }
    
    return camera;
  }
  
  private static createControls(
    camera: THREE.Camera,
    domElement: HTMLElement,
    options: SimpleViewerOptions
  ): ThreeOrbitControlsAdapter | ThreeMapControlsAdapter {
    const controlsOptions = options.controls || {};
    const type = controlsOptions.type || ControlType.OrbitControls;
    
    let controls: ThreeOrbitControlsAdapter | ThreeMapControlsAdapter;
    
    if (type === ControlType.MapControls) {
      controls = new ThreeMapControlsAdapter(camera, domElement);
    } else {
      controls = new ThreeOrbitControlsAdapter(camera, domElement);
    }
    
    // Apply common settings
    controls.enabled = controlsOptions.enabled ?? true;
    controls.enableDamping = controlsOptions.enableDamping ?? true;
    controls.dampingFactor = controlsOptions.dampingFactor ?? 0.25;
    controls.enableZoom = controlsOptions.enableZoom ?? true;
    controls.enableRotate = controlsOptions.enableRotate ?? true;
    controls.enablePan = controlsOptions.enablePan ?? true;
    controls.autoRotate = controlsOptions.autoRotate ?? false;
    if (controlsOptions.autoRotateSpeed !== undefined) {
      controls.autoRotateSpeed = controlsOptions.autoRotateSpeed;
    }
    
    // Apply zoom settings
    if (controlsOptions.minDistance !== undefined) {
      controls.minDistance = controlsOptions.minDistance;
    }
    if (controlsOptions.maxDistance !== undefined) {
      controls.maxDistance = controlsOptions.maxDistance;
    }
    
    // Apply rotation settings
    if (controlsOptions.minPolarAngle !== undefined) {
      controls.minPolarAngle = controlsOptions.minPolarAngle;
    }
    if (controlsOptions.maxPolarAngle !== undefined) {
      controls.maxPolarAngle = controlsOptions.maxPolarAngle;
    }
    
    // Set controls target from camera options
    const cameraOptions = options.camera || {};
    const legacyOptions = cameraOptions as {
      target?: [number, number, number];
      cameraTarget?: [number, number, number];
    };
    const target = legacyOptions.target || legacyOptions.cameraTarget;
    if (target && controls.target) {
      controls.target.set(target[0], target[1], target[2]);
      controls.update();
    }
    
    return controls;
  }
}

/**
 * Extended factory for model loaders
 */
export class ExtendedModelLoaderFactory extends ModelLoaderFactory {
  createDefaultLoader(config: GLTFLoaderConfig = {}) {
    return ModelLoaderFactory.createLoader('model.glb', config);
  }
}
