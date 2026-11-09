import type * as THREE from 'three';
import { Result } from '../utils/Result';
import { ThreeViewerError, ErrorCode } from '../errors';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { IAnimationService } from './services/IAnimationService';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { PathTracingCoordinator } from './PathTracingCoordinator';
import { ContactShadowController } from './ContactShadowController';

export interface AnimationControllerDependencies {
  animationService?: IAnimationService;
  renderLoopManager: RenderLoopManager;
  pathTracing: PathTracingCoordinator;
  contactShadows: ContactShadowController;
  getOptions: () => SimpleViewerOptions;
  repaint: () => void;
}

export class AnimationController {
  private readonly deps: AnimationControllerDependencies;

  constructor(deps: AnimationControllerDependencies) {
    this.deps = deps;
  }

  getClipNames(): string[] {
    return this.deps.animationService?.getClipNames() ?? [];
  }

  isPlaying(): boolean {
    return this.deps.animationService?.isPlaying() ?? false;
  }

  setSpeed(speed: number): void {
    this.deps.animationService?.setSpeed(speed);
  }

  play(clipName?: string): Result<void> {
    const { animationService } = this.deps;
    if (!animationService) {
      if (clipName !== undefined) {
        return Result.err(
          new ThreeViewerError(
            `Cannot play animation clip '${clipName}': the viewer was assembled without an animation service`,
            ErrorCode.INVALID_STATE
          )
        );
      }
      return Result.ok(undefined);
    }
    const played = animationService.play(clipName);
    if (!played.ok) {
      return played;
    }
    if (animationService.isPlaying()) {
      this.deps.contactShadows.followLivePose();
      this.deps.renderLoopManager.requireContinuous('animations');
      this.deps.repaint();
    }
    return Result.ok(undefined);
  }

  pause(): void {
    this.deps.animationService?.pause();
    this.deps.renderLoopManager.releaseContinuous('animations');
    this.deps.contactShadows.rebakeForCurrentPose();
    this.deps.pathTracing.resetAccumulation(true);
    this.deps.renderLoopManager.requestRender();
  }

  autoplay(autoplay: boolean | string): void {
    const played = this.play(typeof autoplay === 'string' ? autoplay : undefined);
    if (!played.ok) {
      console.error('animations.autoplay failed:', played.error.message);
    }
  }

  attachTo(model: THREE.Object3D): void {
    const { animationService } = this.deps;
    if (!animationService) {
      return;
    }
    this.deps.renderLoopManager.releaseContinuous('animations');
    animationService.attach(model);
    const animationOptions = this.deps.getOptions().animations;
    if (animationOptions?.speed !== undefined) {
      animationService.setSpeed(animationOptions.speed);
    }
    const autoplay = animationOptions?.autoplay;
    if (autoplay) {
      this.autoplay(autoplay);
    }
  }

  detach(): void {
    this.deps.animationService?.detach();
  }
}
