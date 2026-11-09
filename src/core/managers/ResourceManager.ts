import type * as THREE from 'three';
import { disposeSceneContents } from '../disposal';
import { IPathTracingService } from '../services/IPathTracingService';
import { IEnvironmentService } from '../services/IEnvironmentService';

export interface ResourceManagerDependencies {
  scene: THREE.Scene;
  pathTracingService?: IPathTracingService;
  environmentService?: IEnvironmentService;
}

export class ResourceManager {
  private readonly scene: THREE.Scene;
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
    disposeSceneContents(this.scene, { keepBackgrounds: true });

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

    disposeSceneContents(this.scene);

    this.triggerGarbageCollection();
  }

  private triggerGarbageCollection(): void {
    if ((globalThis as { gc?: () => void }).gc) {
      (globalThis as { gc?: () => void }).gc?.();
    }
  }
}