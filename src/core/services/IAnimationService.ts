import type * as THREE from 'three';
import { Result } from '../../utils/Result';

export interface IAnimationService {
  attach(model: THREE.Object3D): void;
  getClipNames(): string[];
  play(clipName?: string): Result<void>;
  pause(): void;
  isPlaying(): boolean;
  setSpeed(speed: number): void;
  update(deltaSeconds: number): void;
  detach(): void;
}
