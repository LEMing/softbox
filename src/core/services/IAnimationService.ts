import { IObject3D } from '../interfaces/IObject3D';

/**
 * Plays the animation clips a model carries (GLTF animations, or clips set on
 * a passed object's `animations` field). One model attached at a time; the
 * viewer drives `update()` from its render loop while playback is active.
 */
export interface IAnimationService {
  /** Reads the model's clips; replaces any previously attached model. */
  attach(model: IObject3D): void;
  /** Clip names of the attached model, in file order. */
  getClipNames(): string[];
  /** Plays one clip by name, or ALL clips when no name is given (looped). */
  play(clipName?: string): void;
  pause(): void;
  isPlaying(): boolean;
  /** Playback rate multiplier (1 = authored speed). */
  setSpeed(speed: number): void;
  /** Advances playback; call once per rendered frame. */
  update(deltaSeconds: number): void;
  /** Stops playback and releases the attached model. */
  detach(): void;
}
