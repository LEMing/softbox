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

export class ViewerFactory {
  static createViewer(
    canvas: HTMLCanvasElement,
    options: SimpleViewerOptions
  ): ViewerCore {
    resolveUnitsScaleToMeters(options.units);

    const renderer = new ThreeRendererAdapter(canvas);
    
    const scene = new ThreeSceneAdapter();
    
    const camera = this.createCamera(options);
    
    const controls = this.createControls(
      camera.getThreeCamera(),
      canvas,
      options
    );
    
    const modelLoader = new ExtendedModelLoaderFactory().createDefaultLoader({
      renderer: renderer.getThreeRenderer() ?? undefined,
      bvh: options.selection?.bvh,
      ...options.loaders,
    });
    
    const sceneSetupService = new ThreeSceneSetupService();
    
    const environmentService = new ThreeEnvironmentService();
    
    const pathTracingService = new LazyPathTracingService();

    const floorAlignmentService = new ThreeFloorAlignmentService();

    const selectionService = new ThreeSelectionService();

    const anchorProjectionService = new ThreeAnchorProjectionService();

    const animationService = new ThreeAnimationService();
    
    const rendererOptions = RendererOptionsConverter.convertRendererOptions(
      options.renderer || {}
    );

    rendererOptions.preserveDrawingBuffer = true;
    
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
    
    return new ViewerCore(dependencies);
  }
  
  private static createCamera(options: SimpleViewerOptions): ThreePerspectiveCameraAdapter {
    const cameraOptions = options.camera || {};
    
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
    
    const fov = legacyOptions.fov || legacyOptions.cameraFov || 30;
    const near = legacyOptions.near || legacyOptions.cameraNear || 0.1;
    const far = legacyOptions.far || legacyOptions.cameraFar || 100000;
    const position = legacyOptions.position || legacyOptions.cameraPosition;
    const target = legacyOptions.target || legacyOptions.cameraTarget;
    
    const camera = ThreePerspectiveCameraAdapter.create(
      fov,
      1,
      near,
      far
    );
    
    if (position) {
      camera.position.set(
        position[0],
        position[1],
        position[2]
      );
    }
    
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
    
    if (controlsOptions.minDistance !== undefined) {
      controls.minDistance = controlsOptions.minDistance;
    }
    if (controlsOptions.maxDistance !== undefined) {
      controls.maxDistance = controlsOptions.maxDistance;
    }
    
    if (controlsOptions.minPolarAngle !== undefined) {
      controls.minPolarAngle = controlsOptions.minPolarAngle;
    }
    if (controlsOptions.maxPolarAngle !== undefined) {
      controls.maxPolarAngle = controlsOptions.maxPolarAngle;
    }
    
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

export class ExtendedModelLoaderFactory extends ModelLoaderFactory {
  createDefaultLoader(config: GLTFLoaderConfig = {}) {
    return ModelLoaderFactory.createLoader('model.glb', config);
  }
}
