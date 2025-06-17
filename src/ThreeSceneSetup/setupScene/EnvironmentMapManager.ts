import * as THREE from 'three';
import { PathTracingManager } from './PathTracingManager';
import { importRaytracer } from '../importRaytracer';
import { Result } from '../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../errors';

interface EnvironmentMapManagerParams {
  renderer: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  envMapUrl?: string;
  usePathTracing: boolean;
  pathTracingManager: PathTracingManager | null;
  backgroundBlurriness?: number; // 0.0 to 1.0
  blurStrengthPathTracing?: number; // For BlurredEnvMapGenerator if path tracing is enabled
}

export class EnvironmentMapManager {
  private renderer: THREE.WebGLRenderer | null;
  private scene: THREE.Scene | null;
  private camera: THREE.Camera | null;
  private envMapUrl?: string;
  private usePathTracing: boolean;
  private pathTracingManager: PathTracingManager | null;
  private backgroundBlurriness: number;
  private blurStrengthPathTracing: number;
  private loadedTexture: THREE.Texture | null = null;
  private pmremGenerator: THREE.PMREMGenerator | null = null;

  constructor(params: EnvironmentMapManagerParams) {
    this.renderer = params.renderer;
    this.scene = params.scene;
    this.camera = params.camera;
    this.envMapUrl = params.envMapUrl;
    this.usePathTracing = params.usePathTracing;
    this.pathTracingManager = params.pathTracingManager ?? null;
    this.backgroundBlurriness = params.backgroundBlurriness ?? 0.4;
    this.blurStrengthPathTracing = params.blurStrengthPathTracing ?? 0.4;
  }

  public setup(): Result<void> {
    // Validate required dependencies
    if (!this.renderer) {
      return Result.err(
        new ThreeViewerError(
          'Cannot initialize EnvironmentMapManager: Renderer is not provided',
          ErrorCode.RENDERER_INIT_FAILED,
          { manager: 'EnvironmentMapManager', method: 'setup' }
        )
      );
    }

    if (!this.scene) {
      return Result.err(
        new ThreeViewerError(
          'Cannot initialize EnvironmentMapManager: Scene is not provided',
          ErrorCode.SCENE_INIT_FAILED,
          { manager: 'EnvironmentMapManager', method: 'setup' }
        )
      );
    }

    if (!this.camera) {
      return Result.err(
        new ThreeViewerError(
          'Cannot initialize EnvironmentMapManager: Camera is not provided',
          ErrorCode.CAMERA_INIT_FAILED,
          { manager: 'EnvironmentMapManager', method: 'setup' }
        )
      );
    }

    return Result.ok(undefined);
  }

  public async load(): Promise<Result<THREE.Texture>> {
    // Validate setup was called
    const setupResult = this.setup();
    if (!setupResult.ok) {
      return Result.err(setupResult.error);
    }

    if (!this.envMapUrl) {
      return Result.err(
        new ThreeViewerError(
          'No environment map URL provided',
          ErrorCode.INVALID_CONFIGURATION,
          { manager: 'EnvironmentMapManager', method: 'load' }
        )
      );
    }

    // These are guaranteed to be non-null after setup validation
    const renderer = this.renderer!;
    const scene = this.scene!;
    const camera = this.camera!;

    return new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        this.envMapUrl!,
        (texture) => {
          try {
            this.loadedTexture = texture;
            texture.mapping = THREE.EquirectangularReflectionMapping;

            // Use PMREMGenerator for proper lighting environment
            this.pmremGenerator = new THREE.PMREMGenerator(renderer);
            this.pmremGenerator.compileEquirectangularShader();
            const envMap = this.pmremGenerator.fromEquirectangular(texture).texture;
            
            // Assign environment map
            scene.environment = envMap;
            scene.background = envMap;

            // Use backgroundBlurriness if supported (Three.js r153+)
            scene.backgroundBlurriness = this.backgroundBlurriness;

            // If using path tracing, generate a blurred environment map
            if (this.usePathTracing && this.pathTracingManager) {
              const processResult = this.processPathTracingEnvironment(texture, scene, envMap);
              if (!processResult.ok) {
                resolve(Result.err(processResult.error));
                return;
              }
            } else {
              // Render once to show the updated background (if no path tracing)
              renderer.render(scene, camera);
              texture.dispose();
              this.loadedTexture = null;
            }

            // Clean up PMREM generator after use
            if (this.pmremGenerator) {
              this.pmremGenerator.dispose();
              this.pmremGenerator = null;
            }

            resolve(Result.ok(envMap));
          } catch (error) {
            resolve(Result.err(
              ThreeViewerError.fromError(
                error,
                ErrorCode.RESOURCE_NOT_FOUND,
                { url: this.envMapUrl, manager: 'EnvironmentMapManager' }
              )
            ));
          }
        },
        undefined,
        (error) => {
          resolve(Result.err(
            new ThreeViewerError(
              `Failed to load environment map: ${error}`,
              ErrorCode.RESOURCE_NOT_FOUND,
              { url: this.envMapUrl, originalError: error }
            )
          ));
        }
      );
    });
  }

  private processPathTracingEnvironment(
    texture: THREE.Texture,
    scene: THREE.Scene,
    envMap: THREE.Texture
  ): Result<void> {
    try {
      const { BlurredEnvMapGenerator } = importRaytracer();
      if (!BlurredEnvMapGenerator) {
        return Result.err(
          new ThreeViewerError(
            'Failed to import BlurredEnvMapGenerator',
            ErrorCode.RESOURCE_NOT_FOUND,
            { manager: 'EnvironmentMapManager' }
          )
        );
      }

      if (!this.renderer) {
        return Result.err(
          new ThreeViewerError(
            'Renderer not available for path tracing environment',
            ErrorCode.RENDERER_INIT_FAILED
          )
        );
      }

      const envMapGenerator = new BlurredEnvMapGenerator(this.renderer);
      const blurredEnvMap = envMapGenerator.generate(texture, this.blurStrengthPathTracing);
      
      scene.environment = blurredEnvMap;
      scene.background = blurredEnvMap;

      // Update the environment in the Path Tracer
      if (this.pathTracingManager?.ptRenderer && 'updateEnvironment' in this.pathTracingManager.ptRenderer) {
        const ptRenderer = this.pathTracingManager.ptRenderer as { updateEnvironment: () => void };
        ptRenderer.updateEnvironment();
      }
      
      texture.dispose();
      this.loadedTexture = null;

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        ThreeViewerError.fromError(
          error,
          ErrorCode.RENDER_ERROR,
          { 
            manager: 'EnvironmentMapManager',
            method: 'processPathTracingEnvironment'
          }
        )
      );
    }
  }

  public updateEnvironment(): Result<void> {
    if (!this.scene) {
      return Result.err(
        new ThreeViewerError(
          'Scene not available for environment update',
          ErrorCode.SCENE_INIT_FAILED,
          { manager: 'EnvironmentMapManager' }
        )
      );
    }

    if (!this.scene.environment) {
      return Result.err(
        new ThreeViewerError(
          'No environment map loaded',
          ErrorCode.RESOURCE_NOT_FOUND,
          { manager: 'EnvironmentMapManager' }
        )
      );
    }

    return Result.wrap(() => {
      // Update path tracer if available
      if (this.usePathTracing && this.pathTracingManager?.ptRenderer) {
        if ('updateEnvironment' in this.pathTracingManager.ptRenderer) {
          const ptRenderer = this.pathTracingManager.ptRenderer as { updateEnvironment: () => void };
          ptRenderer.updateEnvironment();
        }
      }
    });
  }

  public dispose(): void {
    // Dispose loaded texture if any
    if (this.loadedTexture) {
      this.loadedTexture.dispose();
      this.loadedTexture = null;
    }

    // Dispose PMREM generator if still active
    if (this.pmremGenerator) {
      this.pmremGenerator.dispose();
      this.pmremGenerator = null;
    }

    // Clear environment from scene
    if (this.scene) {
      this.scene.environment = null;
      this.scene.background = null;
    }

    // Clear references
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.pathTracingManager = null;
  }
}
