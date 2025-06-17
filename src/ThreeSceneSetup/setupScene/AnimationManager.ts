// AnimationManager.ts
import * as THREE from 'three';
import { throttle } from 'lodash';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls';
import {MapControls} from 'three/examples/jsm/controls/MapControls';
import {SimpleViewerOptions} from '../../types';
import {PathTracingManager} from './PathTracingManager';
import { Result } from '../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../errors';

const TIME_PER_FRAME = 1000 / 60; // 60 FPS

export class AnimationManager {
  private renderer: THREE.WebGLRenderer | null;
  private scene: THREE.Scene | null;
  private camera: THREE.Camera | null;
  private controls: OrbitControls | MapControls | null;
  private options: SimpleViewerOptions;
  private isSceneActive = false;
  private pathTracingManager: PathTracingManager | null;
  private animationFrameId: number | null = null;

  constructor(
    renderer: THREE.WebGLRenderer | null,
    scene: THREE.Scene | null,
    camera: THREE.Camera | null,
    controls: OrbitControls | MapControls | null,
    options: SimpleViewerOptions,
    pathTracingManager: PathTracingManager | null
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.options = options;
    this.pathTracingManager = pathTracingManager;
  }

  public setup(): Result<void> {
    // Validate required dependencies
    if (!this.renderer) {
      return Result.err(
        new ThreeViewerError(
          'Cannot initialize AnimationManager: Renderer is not provided',
          ErrorCode.RENDERER_INIT_FAILED,
          { manager: 'AnimationManager', method: 'setup' }
        )
      );
    }

    if (!this.scene) {
      return Result.err(
        new ThreeViewerError(
          'Cannot initialize AnimationManager: Scene is not provided',
          ErrorCode.SCENE_INIT_FAILED,
          { manager: 'AnimationManager', method: 'setup' }
        )
      );
    }

    if (!this.camera) {
      return Result.err(
        new ThreeViewerError(
          'Cannot initialize AnimationManager: Camera is not provided',
          ErrorCode.CAMERA_INIT_FAILED,
          { manager: 'AnimationManager', method: 'setup' }
        )
      );
    }

    if (!this.controls) {
      return Result.err(
        new ThreeViewerError(
          'Cannot initialize AnimationManager: Controls are not provided',
          ErrorCode.INVALID_CONFIGURATION,
          { manager: 'AnimationManager', method: 'setup' }
        )
      );
    }

    return Result.ok(undefined);
  }

  private throttledRender = throttle(() => {
    if (!this.renderer || !this.scene || !this.camera) {
      console.warn('AnimationManager: Cannot render - missing required components');
      return;
    }

    if (this.isSceneActive || !this.options.staticScene) {
      try {
        this.renderer.render(this.scene, this.camera);
      } catch (error) {
        console.error('AnimationManager: Render error', error);
      }
    }
  }, TIME_PER_FRAME);

  private animate = (time: number) => {
    if (!this.isSceneActive && this.options.staticScene) return;

    this.animationFrameId = requestAnimationFrame(this.animate);
    
    if (this.options.animationLoop) {
      try {
        this.options.animationLoop(time);
      } catch (error) {
        console.error('AnimationManager: Error in animation loop', error);
      }
    }

    if (this.controls) {
      this.controls.update();
    }

    if (this.options.usePathTracing && this.pathTracingManager?.ptRenderer) {
      // Update camera for path tracing
      if ('updateCamera' in this.pathTracingManager.ptRenderer) {
        const ptRenderer = this.pathTracingManager.ptRenderer as { updateCamera: () => void };
        ptRenderer.updateCamera();
      }
    }

    if (this.renderer) {
      this.renderer.shadowMap.needsUpdate = true;
    }

    this.throttledRender();
  };

  public startInitialRendering(): void {
    this.animate(performance.now());

    if (this.options.usePathTracing) {
      this.pathTracingManager?.startPathTracing();
    }
  }

  public startRendering(): Result<void> {
    if (!this.renderer || !this.scene || !this.camera || !this.controls) {
      return Result.err(
        new ThreeViewerError(
          'Cannot start rendering: Required components not initialized',
          ErrorCode.INVALID_CONFIGURATION,
          { 
            hasRenderer: !!this.renderer,
            hasScene: !!this.scene,
            hasCamera: !!this.camera,
            hasControls: !!this.controls
          }
        )
      );
    }

    return Result.wrap(() => {
      if (!this.isSceneActive) {
        this.isSceneActive = true;
        if (this.options.usePathTracing) {
          this.pathTracingManager?.stopPathTracing();
        }
        this.animate(performance.now());
      }
    });
  }

  public stopRendering(): Result<void> {
    return Result.wrap(() => {
      this.isSceneActive = false;
      
      // Cancel any pending animation frame
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }

      if (this.options.usePathTracing) {
        this.pathTracingManager?.startPathTracing();
      }
    });
  }

  public dispose(): void {
    // Stop rendering and clean up
    this.stopRendering();
    
    // Cancel throttled render
    this.throttledRender.cancel();

    // Clear references
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.pathTracingManager = null;
  }
}
