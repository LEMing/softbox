import * as THREE from 'three';
import { IAnimationService } from '../../core/services/IAnimationService';
import { IObject3D } from '../../core/interfaces/IObject3D';
import { toThreeObject } from './unwrap';

/**
 * Three.js implementation of the animation port: an AnimationMixer over the
 * clips found on the first subtree node carrying `animations` (the loader
 * copies `gltf.animations` onto the loaded scene; consumer-passed objects may
 * set it directly). Discovery descends past wrapper groups — the units scale
 * wrapper, or a consumer's own positioning group — and the mixer is rooted at
 * the clip-bearing node itself, so root-relative track paths ('.scale' etc.)
 * keep binding to the authored scene rather than to a wrapper whose transform
 * the viewer owns.
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
    const target = toThreeObject(model);
    if (!target) {
      return;
    }
    const clipRoot = findClipBearingNode(target);
    if (clipRoot) {
      this.clips = clipRoot.animations;
      this.mixer = new THREE.AnimationMixer(clipRoot);
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

function findClipBearingNode(root: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((node) => {
    if (!found && (node.animations?.length ?? 0) > 0) {
      found = node;
    }
  });
  return found;
}
