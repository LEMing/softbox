import * as THREE from 'three';
import {
  IRenderer,
  IRendererOptions,
  IRendererCapabilities
} from '../../core/interfaces/IRenderer';
import { IScene } from '../../core/interfaces/IScene';
import { ICamera } from '../../core/interfaces/ICamera';
import { Result } from '../../utils/Result';
import { ThreeSceneAdapter } from './ThreeScene';
import { ThreeCameraAdapter } from './ThreeCamera';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { PathTracingWebGLRenderer } from './types/PathTracerTypes';
import { generateUUID } from '../../utils/uuid';

/**
 * Adapter for Three.js WebGLRenderer to implement IRenderer
 */
export class ThreeRendererAdapter implements IRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private _id: string = generateUUID();
  private canvas?: HTMLCanvasElement;

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  get id(): string {
    return this._id;
  }

  initialize(options: IRendererOptions): Result<void> {
    console.log('[ThreeRendererAdapter] initialize() called');
    try {
      // Create renderer with options
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: options.antialias ?? true,
        alpha: options.alpha ?? false,
        premultipliedAlpha: options.premultipliedAlpha ?? true,
        preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
        powerPreference: options.powerPreference ?? 'default',
      });
      console.log('[ThreeRendererAdapter] WebGLRenderer created successfully');


      // Configure shadow map
      if (options.shadowMap) {
        this.renderer.shadowMap.enabled = options.shadowMap.enabled;
        this.renderer.shadowMap.autoUpdate = true; // Important for dynamic shadows
        if (options.shadowMap.type) {
          const shadowMapTypes = {
            'basic': THREE.BasicShadowMap,
            'pcf': THREE.PCFShadowMap,
            'pcfsoft': THREE.PCFSoftShadowMap,
            'vsm': THREE.VSMShadowMap,
          };
          this.renderer.shadowMap.type = shadowMapTypes[options.shadowMap.type] ;
        }
      }

      // Configure tone mapping
      if (options.toneMapping) {
        const toneMappingTypes = {
          'none': THREE.NoToneMapping,
          'linear': THREE.LinearToneMapping,
          'reinhard': THREE.ReinhardToneMapping,
          'cineon': THREE.CineonToneMapping,
          'aces': THREE.ACESFilmicToneMapping,
        };
        this.renderer.toneMapping = toneMappingTypes[options.toneMapping.type];
        this.renderer.toneMappingExposure = options.toneMapping.exposure;
      }

      // Set pixel ratio
      if (options.pixelRatio !== undefined) {
        this.renderer.setPixelRatio(options.pixelRatio);
      } else {
        this.renderer.setPixelRatio(window.devicePixelRatio);
      }

      // Set initial size if canvas has dimensions
      if (this.canvas) {
        const { clientWidth, clientHeight } = this.canvas.parentElement || this.canvas;
        if (clientWidth && clientHeight) {
          this.renderer.setSize(clientWidth, clientHeight);
        }
      }

      // Set output color space to sRGB for correct colors
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to initialize renderer',
          ErrorCode.RENDERER_INIT_FAILED,
          { originalError: error, options }
        )
      );
    }
  }

  render(scene: IScene, camera: ICamera): Result<void> {
    if (!this.renderer) {
      return Result.err(
        new ThreeViewerError(
          'Renderer not initialized',
          ErrorCode.RENDERER_NOT_INITIALIZED
        )
      );
    }

    try {
      // Extract Three.js objects from adapters
      if (!(scene instanceof ThreeSceneAdapter)) {
        return Result.err(
          new ThreeViewerError(
            'Scene must be a ThreeSceneAdapter',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }

      if (!(camera instanceof ThreeCameraAdapter)) {
        return Result.err(
          new ThreeViewerError(
            'Camera must be a ThreeCameraAdapter',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }

      const threeScene = scene.getThreeScene();
      const threeCamera = camera.getThreeCamera();

      // Check if we should skip rendering because path tracing is active
      // This prevents the standard renderer from overwriting path traced output
      const isPathTracingActive = (this.renderer as PathTracingWebGLRenderer).__pathTracingActive;
      if (isPathTracingActive) {
        console.log('[ThreeRenderer] Skipping standard render - path tracing is active');
        return Result.ok(undefined);
      }

      this.renderer.render(threeScene, threeCamera);
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to render frame',
          ErrorCode.RENDER_FAILED,
          { originalError: error }
        )
      );
    }
  }

  setSize(width: number, height: number): void {
    if (this.renderer) {
      // Use false as third parameter to prevent style updates that can cause flicker
      this.renderer.setSize(width, height, false);
      
      // Manually update canvas style to maintain aspect ratio
      const canvas = this.renderer.domElement;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    }
  }

  setPixelRatio(ratio: number): void {
    if (this.renderer) {
      this.renderer.setPixelRatio(ratio);
    }
  }

  getDomElement(): HTMLCanvasElement {
    if (!this.renderer) {
      throw new Error('Renderer not initialized');
    }
    return this.renderer.domElement;
  }

  getContext(): WebGL2RenderingContext | WebGLRenderingContext {
    if (!this.renderer) {
      throw new Error('Renderer not initialized');
    }
    return this.renderer.getContext();
  }

  get capabilities(): IRendererCapabilities {
    if (!this.renderer) {
      return {
        maxTextureSize: 0,
        maxCubemapSize: 0,
        maxAttributes: 0,
        maxVertexUniforms: 0,
        maxFragmentUniforms: 0,
        maxSamples: 0,
        isWebGL2: false,
      };
    }

    const caps = this.renderer.capabilities;
    return {
      maxTextureSize: caps.maxTextureSize,
      maxCubemapSize: caps.maxCubemapSize,
      maxAttributes: caps.maxAttributes,
      maxVertexUniforms: caps.maxVertexUniforms,
      maxFragmentUniforms: caps.maxFragmentUniforms,
      maxSamples: caps.maxSamples || 0,
      isWebGL2: caps.isWebGL2,
    };
  }

  dispose(): void {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }

  /**
   * Get the internal Three.js renderer
   * Implementation of IRendererExtension interface
   */
  getInternalRenderer(): THREE.WebGLRenderer | null {
    console.log('[ThreeRendererAdapter] getInternalRenderer called, renderer exists:', !!this.renderer);
    return this.renderer;
  }
  
  // Legacy method for backward compatibility
  getThreeRenderer(): THREE.WebGLRenderer | null {
    return this.getInternalRenderer();
  }
}
