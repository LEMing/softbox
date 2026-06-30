import { IScene } from '../interfaces';
import { IPathTracingService } from '../services/IPathTracingService';
import { IEnvironmentService } from '../services/IEnvironmentService';

export interface ResourceManagerDependencies {
  scene: IScene;
  pathTracingService?: IPathTracingService;
  environmentService?: IEnvironmentService;
}

/**
 * Manages resource disposal and cleanup
 */
export class ResourceManager {
  private readonly scene: IScene;
  private pathTracingService?: IPathTracingService;
  private environmentService?: IEnvironmentService;

  constructor(dependencies: ResourceManagerDependencies) {
    this.scene = dependencies.scene;
    this.pathTracingService = dependencies.pathTracingService;
    this.environmentService = dependencies.environmentService;
  }

  /**
   * Update services (needed after screenshot restoration)
   */
  updateServices(services: {
    pathTracingService?: IPathTracingService;
    environmentService?: IEnvironmentService;
  }): void {
    if (services.pathTracingService) {
      this.pathTracingService = services.pathTracingService;
    }
    if (services.environmentService) {
      this.environmentService = services.environmentService;
    }
  }

  /**
   * Dispose heavy scene resources for screenshot mode (model geometry,
   * materials and their textures) while keeping the scene restorable.
   *
   * Both services are intentionally left alive. The path-tracing service keeps
   * the final rendered image on screen behind the overlay. The environment
   * service must survive too: its PMREM background/environment textures are
   * still referenced by `scene.background` / `scene.environment` (preserved via
   * `keepBackgrounds`), and `restoreFromScreenshot` does not re-apply the
   * environment — disposing them here would free GPU textures that are still in
   * use, leaving broken reflections and a blank backdrop once the screenshot is
   * dismissed. Environment textures are released exactly once, later, by
   * {@link dispose}.
   */
  disposeSceneResources(_preservePathTracing: boolean = false): void {
    this.scene.disposeContents({ keepBackgrounds: true });

    // Force garbage collection hint (works in some environments)
    this.triggerGarbageCollection();
  }

  /**
   * Dispose all services
   */
  disposeServices(): void {
    if (this.pathTracingService) {
      this.pathTracingService.dispose();
      this.pathTracingService = undefined;
    }
    
    if (this.environmentService) {
      this.environmentService.dispose();
      this.environmentService = undefined;
    }
  }

  /**
   * Complete disposal of all resources
   */
  dispose(): void {
    // Dispose services (path tracing + environment)
    this.disposeServices();

    // Dispose every GPU-backed resource in the scene, then detach children
    this.scene.disposeContents();

    // Trigger garbage collection
    this.triggerGarbageCollection();
  }

  /**
   * Trigger garbage collection hint
   */
  private triggerGarbageCollection(): void {
    if ((globalThis as { gc?: () => void }).gc) {
      (globalThis as { gc?: () => void }).gc?.();
    }
  }
}