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
  private modelAwaitingBake: THREE.Object3D | null = null;

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
    this.modelAwaitingBake = model;
    this.deps.deferToNextFrame(() => {
      if (!this.isAwaitingBake(model)) {
        return;
      }
      this.modelAwaitingBake = null;
      if (!this.canBake(model)) {
        return;
      }
      this.rebakeForCurrentPose();
      this.deps.repaint();
    });
  }

  finishScheduledBake(): void {
    const model = this.modelAwaitingBake;
    if (!model || !this.canBake(model)) {
      return;
    }
    this.modelAwaitingBake = null;
    this.rebakeForCurrentPose();
  }

  private isAwaitingBake(model: THREE.Object3D): boolean {
    return this.modelAwaitingBake === model;
  }

  private canBake(model: THREE.Object3D): boolean {
    return !this.isStale(model) && !this.deps.isAnimating();
  }

  private isStale(model: THREE.Object3D): boolean {
    return this.deps.isDisposed() || this.deps.getCurrentModel() !== model;
  }
}
