import { Vec3Like } from './Vec3Like';
import { ICamera } from './ICamera';
import { IObject3D } from './IObject3D';

export type AnchorProjection =
  | { visible: false }
  | { visible: true; left: number; top: number };

/**
 * Projects world-space anchor points into canvas CSS pixels — the engine math
 * behind DOM annotations like `Hotspot`. One projector per anchor: it memoizes
 * on the view state (camera pose + canvas size), so frames where nothing
 * relevant changed cost a single matrix comparison.
 */
export interface IAnchorProjector {
  /**
   * Returns the anchor's placement, `{ visible: false }` when it is behind the
   * camera (or occluded, with `occlude` on), or `null` when nothing affecting
   * the projection changed since the last call — keep the previous placement.
   */
  project(anchor: Vec3Like, occlude: boolean): AnchorProjection | null;
  /** Forces the next project() to recompute (e.g. after a model swap). */
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
