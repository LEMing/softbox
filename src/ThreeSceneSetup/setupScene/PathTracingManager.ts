import * as THREE from 'three';
import { SimpleViewerOptions } from '../../types';
import { importRaytracer, type WebGLPathTracer } from '../importRaytracer';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { Result } from '../../utils/Result';

export class PathTracingManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private isPathTracing = false;
  ptRenderer: WebGLPathTracer | null = null;
  private renderCount: number = 0;  // Render pass counter
  private maxSamples: number;  // Maximum number of passes
  private _onComplete: (image: string) => void;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: SimpleViewerOptions,
    onComplete: (image: string) => void
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.maxSamples = options.maxSamplesPathTracing ?? 100;
    this._onComplete = onComplete;
  }

  public setup(): Result<WebGLPathTracer> {
    try {
      // Validate dependencies
      if (!this.renderer) {
        return Result.err(
          new ThreeViewerError(
            'Cannot setup path tracer: Renderer is not provided',
            ErrorCode.RENDERER_INIT_FAILED,
            { manager: 'PathTracingManager' }
          )
        );
      }

      if (!this.scene) {
        return Result.err(
          new ThreeViewerError(
            'Cannot setup path tracer: Scene is not provided',
            ErrorCode.SCENE_INIT_FAILED,
            { manager: 'PathTracingManager' }
          )
        );
      }

      if (!this.camera) {
        return Result.err(
          new ThreeViewerError(
            'Cannot setup path tracer: Camera is not provided',
            ErrorCode.CAMERA_INIT_FAILED,
            { manager: 'PathTracingManager' }
          )
        );
      }

      // Import and create path tracer
      const { WebGLPathTracer } = importRaytracer();
      
      if (!WebGLPathTracer) {
        return Result.err(
          new ThreeViewerError(
            'Failed to import WebGLPathTracer',
            ErrorCode.RESOURCE_NOT_FOUND,
            { manager: 'PathTracingManager' }
          )
        );
      }

      this.ptRenderer = new WebGLPathTracer(this.renderer);
      
      if (!this.ptRenderer) {
        return Result.err(
          new ThreeViewerError(
            'Failed to initialize WebGLPathTracer',
            ErrorCode.INVALID_CONFIGURATION,
            { manager: 'PathTracingManager' }
          )
        );
      }

      // Update path tracer configuration
      const updateResult = this.updatePathTracerRenderer();
      if (!updateResult.ok) {
        return Result.err(updateResult.error);
      }

      return Result.ok(this.ptRenderer);
    } catch (error) {
      return Result.err(
        ThreeViewerError.fromError(
          error,
          ErrorCode.INVALID_CONFIGURATION,
          { 
            manager: 'PathTracingManager',
            maxSamples: this.maxSamples 
          }
        )
      );
    }
  }

  public updatePathTracerRenderer(): Result<void> {
    try {
      if (!this.ptRenderer) {
        return Result.err(
          new ThreeViewerError(
            'Path tracer not initialized',
            ErrorCode.INVALID_CONFIGURATION,
            { manager: 'PathTracingManager' }
          )
        );
      }
      
      this.ptRenderer.setScene(this.scene, this.camera);
      this.ptRenderer.renderToCanvas = true;

      // Update materials and lighting
      this.ptRenderer.updateMaterials();
      this.ptRenderer.updateLights();

      // If the scene contains an environment map, update it for the ray tracer
      if (this.scene.environment) {
        this.ptRenderer.updateEnvironment();
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        ThreeViewerError.fromError(
          error,
          ErrorCode.RENDER_ERROR,
          { 
            phase: 'updatePathTracerRenderer',
            hasEnvironment: !!this.scene.environment 
          }
        )
      );
    }
  }

  set onComplete(value: (image: string) => void) {
    this._onComplete = value;
  }

  get onComplete() {
    return this._onComplete;
  }

  public startPathTracing() {
    if (!this.isPathTracing && this.ptRenderer) {
      this.isPathTracing = true;
      this.renderCount = 0;  // Reset the counter each time Path Tracing starts
      this.ptRenderer.reset(); // Reset the Path Tracer
      this.animatePathTracing();
    }
  }

  public stopPathTracing() {
    this.isPathTracing = false;
  }

  private animatePathTracing = () => {
    if (!this.isPathTracing || !this.ptRenderer) return;

    this.renderCount += 1;
    if (this.renderCount >= this.maxSamples) {
      this.stopPathTracing();
      console.log(`Path tracing completed after ${this.renderCount} samples.`);

      // Save the image
      this.saveScreenshot();
      return;
    }

    requestAnimationFrame(() => this.animatePathTracing());
    this.ptRenderer?.renderSample();
  };

  public saveScreenshot() {
    const canvas = this.renderer.domElement;
    const dataUrl = canvas.toDataURL('image/png');
    this.onComplete(dataUrl);
  }

  // Method to reset and switch to standard rendering
  public resetForStandardRender() {
    this.isPathTracing = false;
    this.renderCount = 0;  // Reset the counter when switching to standard rendering
  }

  public dispose(): void {
    this.stopPathTracing();
    if (this.ptRenderer) {
      // Dispose of path tracer resources if available
      if ('dispose' in this.ptRenderer && typeof this.ptRenderer.dispose === 'function') {
        this.ptRenderer.dispose();
      }
      this.ptRenderer = null;
    }
  }
}
