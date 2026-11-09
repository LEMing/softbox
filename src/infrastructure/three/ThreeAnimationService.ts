import * as THREE from 'three';
import { IAnimationService } from '../../core/services/IAnimationService';
import { Result } from '../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../errors';

export class ThreeAnimationService implements IAnimationService {
  private mixer: THREE.AnimationMixer | null = null;
  private clips: THREE.AnimationClip[] = [];
  private activeActions: THREE.AnimationAction[] = [];
  private playing = false;
  private speed = 1;

  attach(model: THREE.Object3D): void {
    this.detach();
    const clipRoot = findClipBearingNode(model);
    if (clipRoot) {
      this.clips = clipRoot.animations;
      this.mixer = new THREE.AnimationMixer(clipRoot);
      this.mixer.timeScale = this.speed;
    }
  }

  getClipNames(): string[] {
    return this.clips.map((clip) => clip.name);
  }

  play(clipName?: string): Result<void> {
    if (clipName !== undefined) {
      if (this.clips.length === 0) {
        return Result.err(
          new ThreeViewerError(
            `Cannot play animation clip '${clipName}': no animation clips are attached`,
            ErrorCode.INVALID_STATE
          )
        );
      }
      if (!this.clips.some((clip) => clip.name === clipName)) {
        const available = this.clips.map((clip) => clip.name);
        return Result.err(
          new ThreeViewerError(
            `Unknown animation clip '${clipName}'. Available clips: ${available.join(', ')}`,
            ErrorCode.INVALID_PARAMETER
          )
        );
      }
    }
    if (!this.mixer) {
      return Result.ok(undefined);
    }

    if (!this.playing && this.activeActions.length > 0 && clipName === undefined) {
      this.playing = true;
      return Result.ok(undefined);
    }

    const toPlay = clipName
      ? this.clips.filter((clip) => clip.name === clipName)
      : this.clips;
    if (toPlay.length === 0) {
      return Result.ok(undefined);
    }
    const mixer = this.mixer;
    mixer.stopAllAction();
    this.activeActions = toPlay.map((clip) => {
      const action = mixer.clipAction(clip);
      action.play();
      return action;
    });
    this.playing = true;
    return Result.ok(undefined);
  }

  pause(): void {
    this.playing = false;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    if (this.mixer) {
      this.mixer.timeScale = speed;
    }
  }

  update(deltaSeconds: number): void {
    if (this.playing && this.mixer) {
      this.mixer.update(deltaSeconds);
    }
  }

  detach(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot() as THREE.Object3D);
    }
    this.mixer = null;
    this.clips = [];
    this.activeActions = [];
    this.playing = false;
  }
}

function findClipBearingNode(root: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((node) => {
    if (!found && (node.animations?.length ?? 0) > 0) {
      found = node;
    }
  });
  return found;
}
