import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';
import { GroundedSkybox } from 'three/examples/jsm/objects/GroundedSkybox';
import { applyStudioContrast } from './studioEnvironmentContrast';
import { CONTACT_SHADOW_HELPER_FLAG } from './ContactShadowBaker';
import { BACKGROUND_NODE_FLAG, EXTERNALLY_OWNED_TEXTURES_FLAG } from './disposal';
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
import { markCoverFitBackground } from './backgroundImageFit';
import { isPrefilteredEnvironment } from './prefilteredEnvironment';
import { RendererWithInternalAccess } from '../../types/CommonTypes';
import { DEFAULT_STUDIO_LOOK, StudioLook } from '../../types/options';

const STUDIO_CUBE_CAPTURE_SIZE = 256;
const STUDIO_CUBE_NEAR_METERS = 0.1;
const STUDIO_CUBE_FAR_METERS = 100;

type SceneWithOriginalTexture = THREE.Scene & {
  __originalEnvironmentTexture?: THREE.Texture;
};

export const GROUNDED_SKYBOX_NAME = 'softbox-grounded-skybox';

interface StudioBake {
  pmremTexture: THREE.Texture;
  cubeTarget: THREE.WebGLCubeRenderTarget | null;
}

export class ThreeEnvironmentService implements IEnvironmentService {
  private pmremGenerator: THREE.PMREMGenerator | null = null;
  private threeRenderer: THREE.WebGLRenderer | null = null;
  private loadedTextures: Map<string, THREE.Texture> = new Map();
  private renderTargets: THREE.WebGLRenderTarget[] = [];
  private readonly studioBakes = new Map<StudioLook, StudioBake>();
  private readonly originalByPmrem = new WeakMap<THREE.Texture, THREE.Texture>();
  private disposed = false;

  constructor() {
  }

  async initialize(options: IEnvironmentOptions): Promise<Result<void>> {
    try {
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
      const cachedTexture = this.loadedTextures.get(url);
      if (cachedTexture) {
        return Result.ok(new ThreeTextureAdapter(cachedTexture));
      }

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

      if (this.pmremGenerator) {
        texture.mapping = THREE.EquirectangularReflectionMapping;

        const renderTarget = this.pmremGenerator.fromEquirectangular(texture);
        this.renderTargets.push(renderTarget);
        const pmremTexture = renderTarget.texture;
        
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

      threeScene.environment = threeTexture;
      
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
      
      const original = this.originalByPmrem.get(threeTexture);
      if (isPrefilteredEnvironment(threeTexture)) {
        if (original) {
          (threeScene as SceneWithOriginalTexture).__originalEnvironmentTexture = original;
        } else {
          delete (threeScene as SceneWithOriginalTexture).__originalEnvironmentTexture;
        }
      } else if (threeTexture.mapping === THREE.EquirectangularReflectionMapping) {
        (threeScene as SceneWithOriginalTexture).__originalEnvironmentTexture = threeTexture;
      }

      if (options?.setBackground ?? true) {
        disposeViewerOwnedBackground(threeScene);
        if (
          isPrefilteredEnvironment(threeTexture) &&
          original?.mapping === THREE.EquirectangularReflectionMapping
        ) {
          threeScene.background = original;
        } else {
          threeScene.background = threeTexture;
        }
      }

      this.removeGroundedSkybox(threeScene);
      const equirect =
        threeTexture.mapping === THREE.EquirectangularReflectionMapping
          ? threeTexture
          : original?.mapping === THREE.EquirectangularReflectionMapping
            ? original
            : null;
      if (options?.groundProjection && equirect) {
        this.addGroundedSkybox(
          threeScene,
          equirect,
          options.groundProjection,
          options.backgroundIntensity
        );
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

  private addGroundedSkybox(
    threeScene: THREE.Scene,
    equirect: THREE.Texture,
    projection: { height: number; radius: number },
    backgroundIntensity?: number
  ): void {
    const skybox = new GroundedSkybox(equirect, projection.height, projection.radius);
    skybox.name = GROUNDED_SKYBOX_NAME;
    skybox.userData[CONTACT_SHADOW_HELPER_FLAG] = true;
    skybox.userData[BACKGROUND_NODE_FLAG] = true;
    const materials = Array.isArray(skybox.material) ? skybox.material : [skybox.material];
    for (const material of materials) {
      material.userData[EXTERNALLY_OWNED_TEXTURES_FLAG] = true;
      if (backgroundIntensity !== undefined && 'color' in material) {
        (material as THREE.MeshBasicMaterial).color.setScalar(backgroundIntensity);
      }
    }
    skybox.position.y = projection.height - 0.01;
    threeScene.add(skybox);
  }

  removeGroundProjection(scene: IScene): void {
    const threeScene = toThreeScene(scene);
    if (threeScene) {
      this.removeGroundedSkybox(threeScene);
    }
  }

  private removeGroundedSkybox(threeScene: THREE.Scene): void {
    const existing = threeScene.getObjectByName(GROUNDED_SKYBOX_NAME) as THREE.Mesh | undefined;
    if (!existing) {
      return;
    }
    existing.removeFromParent();
    existing.geometry.dispose();
    const materials = Array.isArray(existing.material) ? existing.material : [existing.material];
    materials.forEach((material) => material.dispose());
  }

  getOriginalEnvironmentTexture(url: string): ITexture | null {
    const originalTexture = this.loadedTextures.get(url + '_original');
    return originalTexture ? new ThreeTextureAdapter(originalTexture) : null;
  }

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
      markCoverFitBackground(texture);

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

  createStudioEnvironment(look: StudioLook = DEFAULT_STUDIO_LOOK): Result<ITexture> {
    try {
      if (!this.pmremGenerator) {
        return Result.err(
          new ThreeViewerError(
            'Environment service not initialized',
            ErrorCode.INITIALIZATION_FAILED
          )
        );
      }

      const cached = this.studioBakes.get(look);
      if (cached) {
        return Result.ok(new ThreeTextureAdapter(cached.pmremTexture));
      }

      const roomEnvironment = new RoomEnvironment();
      if (look !== 'soft') {
        applyStudioContrast(roomEnvironment);
      }
      const renderTarget = this.pmremGenerator.fromScene(roomEnvironment);
      this.renderTargets.push(renderTarget);
      const roomTexture = renderTarget.texture;

      this.captureStudioCubeOriginal(look, roomEnvironment, roomTexture);
      if (!this.studioBakes.has(look)) {
        this.studioBakes.set(look, { pmremTexture: roomTexture, cubeTarget: null });
      }

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

  private captureStudioCubeOriginal(
    look: StudioLook,
    room: RoomEnvironment,
    pmremTexture: THREE.Texture
  ): void {
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
      const originalToneMapping = this.threeRenderer.toneMapping;
      this.threeRenderer.toneMapping = THREE.NoToneMapping;
      try {
        cubeCamera.update(this.threeRenderer, room);
      } finally {
        this.threeRenderer.toneMapping = originalToneMapping;
      }
      this.studioBakes.set(look, { pmremTexture, cubeTarget });
      this.originalByPmrem.set(pmremTexture, cubeTarget.texture);
    } catch (error) {
      console.warn('Failed to capture the studio environment for path tracing:', error);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.loadedTextures.forEach(texture => texture.dispose());
    this.loadedTextures.clear();

    this.renderTargets.forEach(target => target.dispose());
    this.renderTargets = [];

    this.studioBakes.forEach(bake => bake.cubeTarget?.dispose());
    this.studioBakes.clear();

    if (this.pmremGenerator) {
      this.pmremGenerator.dispose();
      this.pmremGenerator = null;
    }
    this.threeRenderer = null;
  }
}

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