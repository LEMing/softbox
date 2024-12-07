import * as THREE from 'three';
import { SimpleViewerOptions } from '../../types';
import { importRaytracer } from '../importRaytracer';
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

    if (!this.mountRef.current) throw new Error('Mount div is not ready');

    this.cameraManager = new CameraManager(this.mountRef, this.options);
    this.rendererManager = new RendererManager(this.options);
    this.controlsManager = new ControlsManager(
      this.cameraManager.camera,
      this.rendererManager.renderer.domElement,
      this.options
    );
    this.sceneInitializer = new SceneInitializer(
      this.object,
      this.cameraManager.camera,
      this.controlsManager.controls,
      this.options,
      this.mountRef
    );

    this.rendererRef.current = this.rendererManager.renderer;
    this.cameraRef.current = this.cameraManager.camera;
    this.sceneRef.current = this.sceneInitializer.scene;

    if (this.options.usePathTracing) {
      this.pathTracingManager = new PathTracingManager(
        this.rendererManager.renderer,
        this.sceneInitializer.scene,
        this.cameraManager.camera,
        this.options,
        setRenderCompleteImage
      );
    } else {
      this.pathTracingManager = null;
    }

    // Initialize EnvironmentMapManager
    this.environmentMapManager = new EnvironmentMapManager({
      renderer: this.rendererManager.renderer,
      scene: this.sceneInitializer.scene,
      camera: this.cameraManager.camera,
      envMapUrl: this.options.envMapUrl,
      usePathTracing: this.options.usePathTracing,
      pathTracingManager: this.pathTracingManager,
      backgroundBlurriness: 0.4,
      blurStrengthPathTracing: 0.4
    });

    // Load the environment map via the EnvironmentMapManager
    this.environmentMapManager.load();

    this.mountRef.current.appendChild(this.rendererManager.renderer.domElement);

    this.animationManager = new AnimationManager(
      this.rendererManager.renderer,
      this.sceneInitializer.scene,
      this.cameraManager.camera,
      this.controlsManager.controls,
      this.options,
      this.pathTracingManager
    );

    this.controlsManager.controls.addEventListener('start', () => {
      this.onStartRendering();
    });
    this.controlsManager.controls.addEventListener('end', () =>
      this.animationManager.stopRendering()
    );
  }

  public onStartRendering() {
    if (this.options.usePathTracing) {
      if (!this.pathTracingManager) throw new Error('Path Tracing Manager is not initialized');
      this.pathTracingManager.setupPathTracer();
    }
    this.animationManager.startRendering();
    if (this.options.usePathTracing) {
      this.pathTracingManager?.stopPathTracing();
    }
  }

  public getSceneElements() {
    return {
      scene: this.sceneInitializer.scene,
      camera: this.cameraManager.camera,
      renderer: this.rendererManager.renderer,
      controls: this.controlsManager.controls,
      pathTracingManager: this.pathTracingManager,
    };
  }
}
