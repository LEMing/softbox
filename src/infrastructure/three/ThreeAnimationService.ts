import * as THREE from 'three';
import { IAnimationService } from '../../core/services/IAnimationService';
import { IObject3D } from '../../core/interfaces/IObject3D';
import { toThreeObject } from './unwrap';

/**
 * Three.js implementation of the animation port: an AnimationMixer over the
 * clips found on the model root's `animations` (the loader copies
 * `gltf.animations` there; consumer-passed objects may set it directly).
 */
export class ThreeAnimationService implements IAnimationService {
  private mixer: THREE.AnimationMixer | null = null;
  private clips: THREE.AnimationClip[] = [];
  // The actions play() last started, so a bare resume can pick them back up
  // instead of restarting them from t=0.
  private activeActions: THREE.AnimationAction[] = [];
  private playing = false;
  private speed = 1;

  attach(model: IObject3D): void {
    this.detach();
    const root = toThreeObject(model);
    if (!root) {
      return;
    }
    this.clips = root.animations ?? [];
    if (this.clips.length > 0) {
      this.mixer = new THREE.AnimationMixer(root);
      this.mixer.timeScale = this.speed;
    }
  }

  getClipNames(): string[] {
    return this.clips.map((clip) => clip.name);
  }

  play(clipName?: string): void {
    if (!this.mixer) {
      return;
    }

    // Resuming after pause(): update() has been skipped, so the actions are
    // still sitting at their paused pose — just let update() advance them
    // again instead of restarting via stopAllAction().
    if (!this.playing && this.activeActions.length > 0 && clipName === undefined) {
      this.playing = true;
      return;
    }

    const toPlay = clipName
      ? this.clips.filter((clip) => clip.name === clipName)
      : this.clips;
    if (toPlay.length === 0) {
      return;
    }
    const mixer = this.mixer;
    mixer.stopAllAction();
    this.activeActions = toPlay.map((clip) => {
      const action = mixer.clipAction(clip);
      action.play();
      return action;
    });
    this.playing = true;
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
      // Frees the mixer's per-object binding caches.
      this.mixer.uncacheRoot(this.mixer.getRoot() as THREE.Object3D);
    }
    this.mixer = null;
    this.clips = [];
    this.activeActions = [];
    this.playing = false;
  }
}
