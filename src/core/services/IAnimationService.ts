import { Result } from '../../utils/Result';
import { IObject3D } from '../interfaces/IObject3D';

export interface IAnimationService {
  attach(model: IObject3D): void;
  getClipNames(): string[];
  play(clipName?: string): Result<void>;
  pause(): void;
  isPlaying(): boolean;
  setSpeed(speed: number): void;
  update(deltaSeconds: number): void;
  detach(): void;
}
