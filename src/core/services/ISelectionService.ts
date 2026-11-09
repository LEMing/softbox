import { IObject3D } from '../interfaces';
import { ICamera } from '../interfaces/ICamera';
import { Vec3Like } from '../interfaces/Vec3Like';

export interface SelectionPick {
  object: IObject3D;
  point: Vec3Like;
}

export interface SelectionServiceOptions {
  canvas: HTMLCanvasElement;
  camera: ICamera;
  getPickRoot: () => IObject3D | null;
  onPick: (pick: SelectionPick | null) => void;
  bvh?: boolean;
}

export interface ISelectionService {
  initialize(options: SelectionServiceOptions): void;
  dispose(): void;
}
