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
   * Dispose scene resources (for screenshot mode)
   */
  disposeSceneResources(preservePathTracing: boolean = false): void {
    MemoryMonitor.logMemoryUsage('Before scene disposal');
    
    // Don't dispose path tracing service if we need to preserve the final image
    if (!preservePathTracing && this.pathTracingService) {
      // Keep the service active to preserve the final rendered image
      // This prevents the white screen issue when switching to screenshot
    }
    
    // Dispose environment service
    if (this.environmentService) {
      this.environmentService.dispose();
    }
    
    // Clear and dispose entire scene
    if (this.scene.traverse) {
      this.scene.traverse((child) => {
        if ('geometry' in child && child.geometry) {
          (child.geometry as { dispose?: () => void }).dispose?.();
        }
        if ('material' in child && child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat: { dispose?: () => void }) => {
              mat.dispose?.();
            });
          } else {
            (child.material as { dispose?: () => void }).dispose?.();
          }
        }
      });
    }
    if (this.scene.clear) {
      this.scene.clear();
    }
    
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
    // Dispose services
    this.disposeServices();
    
    // Clear scene
    if (this.scene.clear) {
      this.scene.clear();
    }
    
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