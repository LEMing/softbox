import type * as THREE from 'three';
import type { ViewerRenderer } from './rendering/ViewerRenderer';
import { ISceneSetupService } from './services/ISceneSetupService';

export interface ContactShadowControllerDependencies {
  scene: THREE.Scene;
  renderer: ViewerRenderer;
  sceneSetupService?: ISceneSetupService;
  getCurrentModel: () => THREE.Object3D | null;
  isAnimating: () => boolean;
  isDisposed: () => boolean;
  deferToNextFrame: (callback: () => void) => void;
  repaint: () => void;
}

export class ContactShadowController {
  private readonly deps: ContactShadowControllerDependencies;

  constructor(deps: ContactShadowControllerDependencies) {
    this.deps = deps;
  }

  followLivePose(): void {
    this.deps.sceneSetupService?.setContactShadowMode(this.deps.scene, 'live');
  }

  rebakeForCurrentPose(): void {
    const model = this.deps.getCurrentModel();
    if (!model || !this.deps.sceneSetupService) {
      return;
    }
    const bakeResult = this.deps.sceneSetupService.bakeContactShadow(
      this.deps.scene,
      model,
      this.deps.renderer.getWebGLRenderer()
    );
    if (!bakeResult.ok) {
      console.warn('Failed to bake contact shadow:', bakeResult.error);
    }
  }

  scheduleBakeFor(model: THREE.Object3D): void {
    this.deps.deferToNextFrame(() => {
      if (this.isStale(model) || this.deps.isAnimating()) {
        return;
      }
      this.rebakeForCurrentPose();
      this.deps.repaint();
    });
  }

  private isStale(model: THREE.Object3D): boolean {
    return this.deps.isDisposed() || this.deps.getCurrentModel() !== model;
  }
}
