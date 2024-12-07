import * as THREE from 'three';
import { PathTracingManager } from './PathTracingManager';
import { importRaytracer } from '../importRaytracer';

interface EnvironmentMapManagerParams {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  envMapUrl?: string;
  usePathTracing: boolean;
  pathTracingManager: PathTracingManager | null;
  backgroundBlurriness?: number; // 0.0 to 1.0
  blurStrengthPathTracing?: number; // For BlurredEnvMapGenerator if path tracing is enabled
}

export class EnvironmentMapManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private envMapUrl?: string;
  private usePathTracing: boolean;
  private pathTracingManager: PathTracingManager | null;
  private backgroundBlurriness: number;
  private blurStrengthPathTracing: number;

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

  public load() {
    if (!this.envMapUrl) return;

    const loader = new THREE.TextureLoader();
    loader.load(
      this.envMapUrl,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;

        // Use PMREMGenerator for proper lighting environment
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        pmremGenerator.dispose();
        // Don't dispose original texture yet if we need it for blurred env map

        // Assign environment map
        this.scene.environment = envMap;
        this.scene.background = envMap;

        // Use backgroundBlurriness if supported (Three.js r153+)
        this.scene.backgroundBlurriness = this.backgroundBlurriness;

        // If using path tracing, generate a blurred environment map
        if (this.usePathTracing && this.pathTracingManager) {
          const { BlurredEnvMapGenerator } = importRaytracer();
          const envMapGenerator = new BlurredEnvMapGenerator(this.renderer);

          const blurredEnvMap = envMapGenerator.generate(texture, this.blurStrengthPathTracing);
          this.scene.environment = blurredEnvMap;
          this.scene.background = blurredEnvMap;

          // Update the environment in the Path Tracer
          this.pathTracingManager.ptRenderer.updateEnvironment();
          texture.dispose();
        } else {
          // Render once to show the updated background (if no path tracing)
          this.renderer.render(this.scene, this.camera);
          texture.dispose();
        }
      },
      undefined,
      (error) => {
        console.error('Error loading environment map:', error);
      }
    );
  }
}
