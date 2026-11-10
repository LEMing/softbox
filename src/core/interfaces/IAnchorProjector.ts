import { Vec3Like } from './Vec3Like';
import { ICamera } from './ICamera';
import { IObject3D } from './IObject3D';

export type AnchorProjection =
  | { visible: false }
  | { visible: true; left: number; top: number };

export interface IAnchorProjector {
  project(anchor: Vec3Like, occlude: boolean): AnchorProjection | null;
  invalidate(): void;
}

export interface AnchorProjectorSources {
  camera: ICamera;
  getCanvas: () => HTMLCanvasElement | null;
  getModel: () => IObject3D | null;
}

export interface IAnchorProjectionService {
  createProjector(sources: AnchorProjectorSources): IAnchorProjector;
}
