import { IScene } from '../interfaces';
import { IPathTracingService } from '../services/IPathTracingService';
import { IEnvironmentService } from '../services/IEnvironmentService';
import { MemoryMonitor } from '../utils/MemoryMonitor';

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
   * Dispose scene geometry/materials/textures (for screenshot mode).
   *
   * The path-tracing service is intentionally left alive so the final rendered
   * image stays on screen behind the screenshot overlay; only the scene graph
   * and the environment service are released here.
   */
  disposeSceneResources(_preservePathTracing: boolean = false): void {
    MemoryMonitor.logMemoryUsage('Before scene disposal');

    if (this.environmentService) {
      this.environmentService.dispose();
    }

    // Keep the background texture so the scene can be restored from the screenshot.
    this.scene.disposeContents({ keepBackgrounds: true });

    // Force garbage collection hint (works in some environments)
    this.triggerGarbageCollection();

    MemoryMonitor.logMemoryUsage('After scene disposal');

    // Schedule another check after potential GC
    setTimeout(() => {
      MemoryMonitor.logMemoryUsage('After GC delay');
    }, 2000);
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