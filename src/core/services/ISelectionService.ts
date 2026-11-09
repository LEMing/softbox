import type * as THREE from 'three';
import { Vec3Like } from '../../types/Vec3Like';

export interface SelectionPick {
  object: THREE.Object3D;
  point: Vec3Like;
}

export interface SelectionServiceOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  getPickRoot: () => THREE.Object3D | null;
  onPick: (pick: SelectionPick | null) => void;
  bvh?: boolean;
}

export interface ISelectionService {
  initialize(options: SelectionServiceOptions): void;
  dispose(): void;
}
