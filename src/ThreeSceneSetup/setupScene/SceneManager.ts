import * as THREE from 'three';
import { SimpleViewerOptions } from '../../types';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { CameraManager } from './CameraManager';
import { RendererManager } from './RendererManager';
import { ControlsManager } from './ControlsManager';
import { SceneInitializer } from '../SceneInitializer';
import { PathTracingManager } from './PathTracingManager';
import { AnimationManager } from './AnimationManager';
import { THREEBase } from '../types';
import { EnvironmentMapManager } from './EnvironmentMapManager';

export class SceneManager {
  private mountRef;
  private sceneRef;
  private rendererRef;
  private cameraRef;
  private object;
  private options;
  private cameraManager: CameraManager;
  private rendererManager: RendererManager;
  private controlsManager: ControlsManager;
  private sceneInitializer: SceneInitializer;
  public readonly pathTracingManager: PathTracingManager | null;
  private animationManager: AnimationManager;
  private environmentMapManager: EnvironmentMapManager | null = null;

  constructor(
    threeBase: THREEBase,
    object: THREE.Object3D | null,
    options: SimpleViewerOptions,
    setRenderCompleteImage: (image: string | null) => void
  ) {
    const { mountRef, sceneRef, rendererRef, cameraRef } = threeBase;
    this.mountRef = mountRef;
    this.sceneRef = sceneRef;
    this.rendererRef = rendererRef;
    this.cameraRef = cameraRef;
    this.object = object;
    this.options = options;

    if (!this.mountRef.current) {
      throw new ThreeViewerError(
        'Mount element is not ready',
        ErrorCode.COMPONENT_NOT_MOUNTED
      );
    }

    // Initialize managers
    this.cameraManager = new CameraManager(this.mountRef, this.options);
    this.rendererManager = new RendererManager(this.options);
    
    // Setup renderer with Result pattern
    const rendererResult = this.rendererManager.setup();
    if (!rendererResult.ok) {
      throw rendererResult.error;
    }
    
    this.controlsManager = new ControlsManager(
      this.cameraManager.camera,
      rendererResult.value.domElement,
      this.options
    );
    
    // Setup controls
    const controlsResult = this.controlsManager.setup();
    if (!controlsResult.ok) {
      throw controlsResult.error;
    }
    this.sceneInitializer = new SceneInitializer(
      this.object,
      this.cameraManager.camera,
      controlsResult.value,
      this.options,
      this.mountRef
    );
    
    // Setup scene
    const sceneResult = this.sceneInitializer.setup();
    if (!sceneResult.ok) {
      throw sceneResult.error;
    }

    this.rendererRef.current = rendererResult.value;
    this.cameraRef.current = this.cameraManager.camera;
    this.sceneRef.current = sceneResult.value;

    if (this.options.usePathTracing) {
      this.pathTracingManager = new PathTracingManager(
        rendererResult.value,
        sceneResult.value,
        this.cameraManager.camera,
        this.options,
        setRenderCompleteImage
      );
      
      // Setup path tracer
      const pathTracerResult = this.pathTracingManager.setup();
      if (!pathTracerResult.ok) {
        console.warn('Failed to setup path tracer:', pathTracerResult.error);
        // Path tracing is optional, so we don't throw here
        this.pathTracingManager = null;
      }
    } else {
      this.pathTracingManager = null;
    }

    // Initialize EnvironmentMapManager
    this.environmentMapManager = new EnvironmentMapManager({
      renderer: rendererResult.value,
      scene: sceneResult.value,
      camera: this.cameraManager.camera,
      envMapUrl: this.options.envMapUrl,
      usePathTracing: this.options.usePathTracing,
      pathTracingManager: this.pathTracingManager,
      backgroundBlurriness: 0.4,
      blurStrengthPathTracing: 0.4
    });

    // Setup environment map manager
    const envSetupResult = this.environmentMapManager.setup();
    if (!envSetupResult.ok) {
      console.warn('Failed to setup environment map manager:', envSetupResult.error);
      // Environment map is optional, so we don't throw here
    }

    // Load the environment map asynchronously
    if (this.options.envMapUrl) {
      this.environmentMapManager.load().then(result => {
        if (!result.ok) {
          console.warn('Failed to load environment map:', result.error);
        }
      });
    }

    this.mountRef.current.appendChild(rendererResult.value.domElement);

    this.animationManager = new AnimationManager(
      rendererResult.value,
      sceneResult.value,
      this.cameraManager.camera,
      controlsResult.value,
      this.options,
      this.pathTracingManager
    );

    // Setup animation manager
    const animationResult = this.animationManager.setup();
    if (!animationResult.ok) {
      throw animationResult.error;
    }
    
    // Start initial rendering
    this.animationManager.startInitialRendering();

    controlsResult.value.addEventListener('start', () => {
      this.onStartRendering();
    });
    controlsResult.value.addEventListener('end', () => {
      const stopResult = this.animationManager.stopRendering();
      if (!stopResult.ok) {
        console.warn('Failed to stop rendering:', stopResult.error);
      }
    });
  }

  public onStartRendering() {
    if (this.options.usePathTracing) {
      if (!this.pathTracingManager) {
        throw new ThreeViewerError(
          'Path Tracing Manager is not initialized',
          ErrorCode.RENDERER_INIT_FAILED
        );
      }
      // Path tracer is already setup during initialization
    }
    
    const startResult = this.animationManager.startRendering();
    if (!startResult.ok) {
      console.error('Failed to start rendering:', startResult.error);
      throw startResult.error;
    }
    
    if (this.options.usePathTracing) {
      this.pathTracingManager?.stopPathTracing();
    }
  }

  public getSceneElements() {
    return {
      scene: this.sceneInitializer.scene!,
      camera: this.cameraManager.camera,
      renderer: this.rendererManager.renderer!,
      controls: this.controlsManager.controls!,
      pathTracingManager: this.pathTracingManager,
    };
  }
}
