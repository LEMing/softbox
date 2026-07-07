import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';
import { 
  IEnvironmentService, 
  IEnvironmentOptions,
  IStudioEnvironmentOptions,
  IEnvironmentApplyOptions 
} from '../../core/services/IEnvironmentService';
import { IScene, ITexture } from '../../core/interfaces/IScene';
import { Result } from '../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { toThreeScene, toThreeTexture } from './unwrap';
import { RendererWithInternalAccess } from '../../types/CommonTypes';

type SceneWithOriginalTexture = THREE.Scene & {
  __originalEnvironmentTexture?: THREE.Texture;
};

export class ThreeEnvironmentService implements IEnvironmentService {
  private pmremGenerator: THREE.PMREMGenerator | null = null;
  private threeRenderer: THREE.WebGLRenderer | null = null;
  private loadedTextures: Map<string, THREE.Texture> = new Map();
  // PMREM outputs live in render targets; disposing only their .texture leaks
  // one FBO per build, so the targets themselves are retained and freed.
  private renderTargets: THREE.WebGLRenderTarget[] = [];
  // Cube capture of the procedural studio room, keyed by its PMREM texture:
  // the path tracer cannot read PMREM's packed CubeUV layout, but it converts
  // a plain cube texture to the equirectangular map it needs by itself.
  private studioPmremTexture: THREE.Texture | null = null;
  private studioCubeTarget: THREE.WebGLCubeRenderTarget | null = null;
  private disposed = false;

  constructor() {
    // PMREMGenerator will be created when initialize is called with a renderer
  }

  async initialize(options: IEnvironmentOptions): Promise<Result<void>> {
    try {
      // Get the Three.js renderer
      const rendererAccess = options.renderer as RendererWithInternalAccess;
      let threeRenderer = rendererAccess.renderer || 
        rendererAccess.getThreeRenderer?.();
      
      if (!threeRenderer && rendererAccess.getDomElement) {
        const canvas = rendererAccess.getDomElement();
        if (canvas && 'parentElement' in canvas && canvas.parentElement) {
          const parentRenderer = (canvas.parentElement as unknown as { renderer?: THREE.WebGLRenderer }).renderer;
          if (parentRenderer instanceof THREE.WebGLRenderer) {
            threeRenderer = parentRenderer;
          }
        }
      }
      
      if (!threeRenderer) {
        return Result.err(
          new ThreeViewerError(
            'Could not access Three.js renderer',
            ErrorCode.INITIALIZATION_FAILED
          )
        );
      }

      this.threeRenderer = threeRenderer;
      this.pmremGenerator = new THREE.PMREMGenerator(threeRenderer);
      this.pmremGenerator.compileEquirectangularShader();

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to initialize environment service',
          ErrorCode.INITIALIZATION_FAILED,
          { originalError: error }
        )
      );
    }
  }

  async loadEnvironmentMap(url: string): Promise<Result<ITexture>> {
    try {
      // Check cache
      const cachedTexture = this.loadedTextures.get(url);
      if (cachedTexture) {
        return Result.ok(new ThreeTextureAdapter(cachedTexture));
      }

      // Determine loader based on file extension
      const extension = url.split('.').pop()?.toLowerCase();
      let loader: RGBELoader | EXRLoader | THREE.TextureLoader;

      switch (extension) {
        case 'hdr':
          loader = new RGBELoader();
          break;
        case 'exr':
          loader = new EXRLoader();
          break;
        case 'jpg':
        case 'jpeg':
        case 'png':
          loader = new THREE.TextureLoader();
          break;
        default:
          return Result.err(
            new ThreeViewerError(
              `Unsupported environment map format: ${extension}`,
              ErrorCode.UNSUPPORTED_FORMAT,
              { url, extension }
            )
          );
      }

      // Load texture
      const texture = await new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(
          url,
          (texture) => {
            resolve(texture);
          },
          undefined,
          (error) => reject(error)
        );
      });

      // The service can be torn down while the fetch is in flight (StrictMode
      // remount, fast structural rebuild) — don't cache into a disposed store.
      if (this.disposed) {
        texture.dispose();
        return Result.err(
          new ThreeViewerError(
            'Environment service was disposed during the load',
            ErrorCode.INVALID_STATE,
            { url }
          )
        );
      }

      // Process with PMREM for environment mapping
      if (this.pmremGenerator) {
        // Set the mapping for equirectangular projection
        texture.mapping = THREE.EquirectangularReflectionMapping;

        const renderTarget = this.pmremGenerator.fromEquirectangular(texture);
        this.renderTargets.push(renderTarget);
        const pmremTexture = renderTarget.texture;
        // Keep the original texture for path tracing
        // texture.dispose(); // Don't dispose - path tracer needs the original
        
        // Store both textures - PMREM for standard rendering, original for path tracing
        this.loadedTextures.set(url, pmremTexture);
        this.loadedTextures.set(url + '_original', texture);
        
        
        return Result.ok(new ThreeTextureAdapter(pmremTexture));
      }

      this.loadedTextures.set(url, texture);
      return Result.ok(new ThreeTextureAdapter(texture));
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to load environment map',
          ErrorCode.TEXTURE_LOAD_FAILED,
          { url, originalError: error }
        )
      );
    }
  }

  applyToScene(scene: IScene, texture: ITexture, options?: IEnvironmentApplyOptions): Result<void> {
    try {
      const threeScene = toThreeScene(scene);
      if (!threeScene) {
        return Result.err(
          new ThreeViewerError(
            'Scene must be ThreeSceneAdapter',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }

      const threeTexture = toThreeTexture(texture);
      if (!threeTexture) {
        return Result.err(
          new ThreeViewerError(
            'Texture must be ThreeTextureAdapter',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }

      // Set environment for reflections
      threeScene.environment = threeTexture;
      
      // Apply blur and intensity settings if provided
      if (options) {
        if (options.backgroundBlurriness !== undefined) {
          threeScene.backgroundBlurriness = options.backgroundBlurriness;
        }
        if (options.backgroundIntensity !== undefined) {
          threeScene.backgroundIntensity = options.backgroundIntensity;
        }
        if (options.environmentIntensity !== undefined) {
          threeScene.environmentIntensity = options.environmentIntensity;
        }
      }
      
      // IMPORTANT: Also set the original texture for path tracing
      // Path tracer needs equirectangular texture, not PMREM
      if (threeTexture.mapping === THREE.CubeUVReflectionMapping) {
        // Find the original equirectangular texture
        const originalTextures = Array.from(this.loadedTextures.entries());
        const originalEntry = originalTextures.find(([key, tex]) =>
          key.endsWith('_original') && tex.mapping === THREE.EquirectangularReflectionMapping
        );

        if (originalEntry) {
          // Store original texture reference for path tracer
          (threeScene as SceneWithOriginalTexture).__originalEnvironmentTexture = originalEntry[1];
        } else if (threeTexture === this.studioPmremTexture && this.studioCubeTarget) {
          // The procedural studio room has no file-loaded original; its cube
          // capture is what the path tracer can convert and ingest.
          (threeScene as SceneWithOriginalTexture).__originalEnvironmentTexture =
            this.studioCubeTarget.texture;
        }
      } else if (threeTexture.mapping === THREE.EquirectangularReflectionMapping) {
        // If we already have equirectangular, use it directly
        (threeScene as SceneWithOriginalTexture).__originalEnvironmentTexture = threeTexture;
      }
      
      // For background, try to use the original texture if available
      // PMREM textures can cause the weird sphere effect when used as background
      if (options?.setBackground ?? true) {
        if (threeTexture.mapping === THREE.EquirectangularReflectionMapping) {
          // Equirectangular textures can be used directly as background
          threeScene.background = threeTexture;
        } else if (threeTexture.mapping === THREE.CubeUVReflectionMapping) {
          // For PMREM textures, try to find the original texture
          // Check if we have the original texture stored
          const originalTextures = Array.from(this.loadedTextures.entries());
          const originalEntry = originalTextures.find(([key, tex]) =>
            key.endsWith('_original') && tex.mapping === THREE.EquirectangularReflectionMapping
          );

          if (originalEntry) {
            // Use the original equirectangular texture as background
            threeScene.background = originalEntry[1];
          } else {
            // If no original available, use the PMREM texture anyway
            // It might look weird but it's better than black
            threeScene.background = threeTexture;
          }
        } else {
          // For other textures, use them as background
          threeScene.background = threeTexture;
        }
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to apply environment to scene',
          ErrorCode.SCENE_OPERATION_FAILED,
          { originalError: error }
        )
      );
    }
  }

  /**
   * Get the original environment texture (for path tracing)
   */
  getOriginalEnvironmentTexture(url: string): ITexture | null {
    const originalTexture = this.loadedTextures.get(url + '_original');
    return originalTexture ? new ThreeTextureAdapter(originalTexture) : null;
  }

  createStudioEnvironment(_options: IStudioEnvironmentOptions = {}): Result<ITexture> {
    try {
      if (!this.pmremGenerator) {
        return Result.err(
          new ThreeViewerError(
            'Environment service not initialized',
            ErrorCode.INITIALIZATION_FAILED
          )
        );
      }

      // Create RoomEnvironment scene
      const roomEnvironment = new RoomEnvironment();
      const renderTarget = this.pmremGenerator.fromScene(roomEnvironment);
      this.renderTargets.push(renderTarget);
      const roomTexture = renderTarget.texture;

      this.captureStudioCubeOriginal(roomEnvironment, roomTexture);

      // Clean up
      roomEnvironment.dispose();

      return Result.ok(new ThreeTextureAdapter(roomTexture));
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to create studio environment',
          ErrorCode.TEXTURE_LOAD_FAILED,
          { originalError: error }
        )
      );
    }
  }

  /**
   * Capture the studio room into a plain cube texture alongside the PMREM
   * build. PMREM's packed CubeUV layout is only readable by the raster
   * pipeline; the path tracer needs a source it can convert to an
   * equirectangular map, and it accepts cube textures for exactly that.
   * Failure is non-fatal — the raster look is untouched, path tracing
   * just has no environment to ingest (and pauses itself as before).
   */
  private captureStudioCubeOriginal(room: RoomEnvironment, pmremTexture: THREE.Texture): void {
    if (!this.threeRenderer) {
      return;
    }
    try {
      const cubeTarget = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
      const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeTarget);
      // Capture raw HDR radiance like PMREM does internally: tone mapping
      // would bake the display transform into the light values and the room
      // reads several stops too dark as an environment.
      const originalToneMapping = this.threeRenderer.toneMapping;
      this.threeRenderer.toneMapping = THREE.NoToneMapping;
      try {
        cubeCamera.update(this.threeRenderer, room);
      } finally {
        this.threeRenderer.toneMapping = originalToneMapping;
      }
      this.studioCubeTarget?.dispose();
      this.studioCubeTarget = cubeTarget;
      this.studioPmremTexture = pmremTexture;
    } catch (error) {
      console.warn('Failed to capture the studio environment for path tracing:', error);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.loadedTextures.forEach(texture => texture.dispose());
    this.loadedTextures.clear();

    // Render-target dispose also frees its texture; texture.dispose above is
    // idempotent, so the double call is harmless.
    this.renderTargets.forEach(target => target.dispose());
    this.renderTargets = [];

    this.studioCubeTarget?.dispose();
    this.studioCubeTarget = null;
    this.studioPmremTexture = null;

    if (this.pmremGenerator) {
      this.pmremGenerator.dispose();
      this.pmremGenerator = null;
    }
    this.threeRenderer = null;
  }
}

// Adapter for Three.js Texture
class ThreeTextureAdapter implements ITexture {
  constructor(private texture: THREE.Texture) {}

  get id(): string {
    return this.texture.uuid;
  }

  get image(): HTMLImageElement | ImageData | HTMLCanvasElement | HTMLVideoElement | null {
    return this.texture.image as HTMLImageElement | ImageData | HTMLCanvasElement | HTMLVideoElement | null;
  }

  get needsUpdate(): boolean {
    return this.texture.needsUpdate;
  }

  set needsUpdate(value: boolean) {
    this.texture.needsUpdate = value;
  }

  dispose(): void {
    this.texture.dispose();
  }

  getThreeTexture(): THREE.Texture {
    return this.texture;
  }
}