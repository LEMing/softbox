import { IScene } from '../interfaces';
import { IPathTracingService } from '../services/IPathTracingService';
import { IEnvironmentService } from '../services/IEnvironmentService';

export interface ResourceManagerDependencies {
  scene: IScene;
  pathTracingService?: IPathTracingService;
  environmentService?: IEnvironmentService;
}

export class ResourceManager {
  private readonly scene: IScene;
  private pathTracingService?: IPathTracingService;
  private environmentService?: IEnvironmentService;

  constructor(dependencies: ResourceManagerDependencies) {
    this.scene = dependencies.scene;
    this.pathTracingService = dependencies.pathTracingService;
    this.environmentService = dependencies.environmentService;
  }

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

  disposeSceneResources(_preservePathTracing: boolean = false): void {
    this.scene.disposeContents({ keepBackgrounds: true });

    this.triggerGarbageCollection();
  }

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

  dispose(): void {
    this.disposeServices();

    this.scene.disposeContents();

    this.triggerGarbageCollection();
  }

  private triggerGarbageCollection(): void {
    if ((globalThis as { gc?: () => void }).gc) {
      (globalThis as { gc?: () => void }).gc?.();
    }
  }
}