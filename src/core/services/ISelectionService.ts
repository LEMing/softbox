import { IObject3D } from '../interfaces';
import { ICamera } from '../interfaces/ICamera';

/** A pick result: the hit object and the world-space hit point. */
export interface SelectionPick {
  object: IObject3D;
  point: { x: number; y: number; z: number };
}

export interface SelectionServiceOptions {
  canvas: HTMLCanvasElement;
  camera: ICamera;
  /** The root to pick against (the loaded model); null while nothing is loaded. */
  getPickRoot: () => IObject3D | null;
  /** Called with the pick on a hit, or null when the click hit empty space. */
  onPick: (pick: SelectionPick | null) => void;
}

/**
 * Click-picking on the canvas, engine-agnostic contract. Implementations own
 * the pointer listeners and must distinguish clicks from orbit drags.
 */
export interface ISelectionService {
  initialize(options: SelectionServiceOptions): void;
  dispose(): void;
}
