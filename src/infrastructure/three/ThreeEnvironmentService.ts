import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';
import { applyStudioContrast } from './studioEnvironmentContrast';
import { 
  IEnvironmentService, 
  IEnvironmentOptions,
  IEnvironmentApplyOptions 
} from '../../core/services/IEnvironmentService';
import { IScene, ITexture } from '../../core/interfaces/IScene';
import { Result } from '../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { toThreeScene, toThreeTexture } from './unwrap';
import { markViewerOwnedBackground, disposeViewerOwnedBackground } from './backgroundOwnership';
import { RendererWithInternalAccess } from '../../types/CommonTypes';

/** Cube face size for the studio-room capture the path tracer ingests:
 * enough for soft studio lighting (the tracer blurs it into an equirect
 * anyway), cheap enough to bake once per session. */
const STUDIO_CUBE_CAPTURE_SIZE = 256;
/** Near/far span covering the RoomEnvironment's ~10m procedural room. */
const STUDIO_CUBE_NEAR_METERS = 0.1;
const STUDIO_CUBE_FAR_METERS = 100;

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
  // Each PMREM texture mapped to the source the path tracer can actually read
  // (the loaded equirect, or the studio cube capture). applyToScene receives
  // only the PMREM, and scanning the cache for "any _original" instead binds
  // every later environment to the FIRST one ever loaded.
  private readonly originalByPmrem = new WeakMap<THREE.Texture, THREE.Texture>();
  private disposed = false;

  constructor() {
    // PMREMGenerator will be created when initialize is called with a renderer
  }

  async initialize(options: IEnvironmentOptions): Promise<Result<void>> {
    try {
      // Get the Three.js renderer
      const rendererAccess = options.renderer as RendererWithInternalAccess;
      const threeRenderer = rendererAccess.renderer ||
        rendererAccess.getThreeRenderer?.();

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
        this.originalByPmrem.set(pmremTexture, texture);

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
      
      // Also hand the path tracer a source it can read: the tracer cannot
      // consume PMREM's packed CubeUV layout, so a PMREM environment resolves
      // through originalByPmrem to ITS OWN source (the loaded equirect, or the
      // studio cube capture) — never to whichever original happens to sit
      // first in the cache.
      const original = this.originalByPmrem.get(threeTexture);
      if (threeTexture.mapping === THREE.CubeUVReflectionMapping) {
        if (original) {
          (threeScene as SceneWithOriginalTexture).__originalEnvironmentTexture = original;
        } else {
          // No readable source for this PMREM (the studio cube capture can
          // fail soft): clear any stale original from a previously applied
          // environment so the tracer's PMREM-without-original give-up path
          // engages instead of ingesting the old environment's light.
          delete (threeScene as SceneWithOriginalTexture).__originalEnvironmentTexture;
        }
      } else if (threeTexture.mapping === THREE.EquirectangularReflectionMapping) {
        // Already equirectangular — usable by the tracer directly.
        (threeScene as SceneWithOriginalTexture).__originalEnvironmentTexture = threeTexture;
      }

      // For the visible backdrop prefer the matching equirect original: a PMREM
      // texture used as background renders as a weird low-res sphere. The studio
      // cube capture is not equirect and never reaches here as a backdrop (the
      // studio path applies with setBackground: false).
      if (options?.setBackground ?? true) {
        disposeViewerOwnedBackground(threeScene);
        if (
          threeTexture.mapping === THREE.CubeUVReflectionMapping &&
          original?.mapping === THREE.EquirectangularReflectionMapping
        ) {
          threeScene.background = original;
        } else {
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

  /**
   * Set the scene background to a plain (non-equirect) LDR image without touching
   * scene.environment — the studio/HDRI lighting stays, only the backdrop changes.
   * Accepts an image URL/data-URL, a File, or an HTMLImageElement.
   */
  async setBackgroundImage(
    scene: IScene,
    source: string | File | HTMLImageElement
  ): Promise<Result<void>> {
    try {
      const threeScene = toThreeScene(scene);
      if (!threeScene) {
        return Result.err(
          new ThreeViewerError('Scene must be ThreeSceneAdapter', ErrorCode.INVALID_PARAMETER)
        );
      }

      const texture = await this.loadBackgroundTexture(source);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      markViewerOwnedBackground(texture);

      // Free the outgoing background ONLY if the viewer painted it — an
      // env-map backdrop is the cached original the cache/tracer still hold.
      disposeViewerOwnedBackground(threeScene);
      threeScene.background = texture;
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError('Failed to set background image', ErrorCode.TEXTURE_LOAD_FAILED, {
          originalError: error,
        })
      );
    }
  }

  private loadBackgroundTexture(
    source: string | File | HTMLImageElement
  ): Promise<THREE.Texture> {
    if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
      const texture = new THREE.Texture(source);
      texture.needsUpdate = true;
      return Promise.resolve(texture);
    }
    const objectUrl =
      typeof File !== 'undefined' && source instanceof File ? URL.createObjectURL(source) : null;
    const url = objectUrl ?? (source as string);
    return new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(
        url,
        texture => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          resolve(texture);
        },
        undefined,
        error => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          reject(error);
        }
      );
    });
  }

  createStudioEnvironment(): Result<ITexture> {
    try {
      if (!this.pmremGenerator) {
        return Result.err(
          new ThreeViewerError(
            'Environment service not initialized',
            ErrorCode.INITIALIZATION_FAILED
          )
        );
      }

      // The studio room is deterministic, so one bake serves the whole session:
      // without this cache every setEnvironmentMap↔resetEnvironment round trip
      // pushed another PMREM render target (only freed at dispose) and re-ran
      // the full room bake + cube capture.
      if (this.studioPmremTexture && this.studioCubeTarget) {
        return Result.ok(new ThreeTextureAdapter(this.studioPmremTexture));
      }

      // Create RoomEnvironment scene, pushed to a higher-contrast studio look
      // (darker surround, punchier soft-boxes) before it is baked — so both the
      // PMREM env map and the path tracer's cube capture below share it.
      const roomEnvironment = new RoomEnvironment();
      applyStudioContrast(roomEnvironment);
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
      const cubeTarget = new THREE.WebGLCubeRenderTarget(STUDIO_CUBE_CAPTURE_SIZE, {
        type: THREE.HalfFloatType,
      });
      const cubeCamera = new THREE.CubeCamera(
        STUDIO_CUBE_NEAR_METERS,
        STUDIO_CUBE_FAR_METERS,
        cubeTarget
      );
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
      this.originalByPmrem.set(pmremTexture, cubeTarget.texture);
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