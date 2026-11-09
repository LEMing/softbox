import * as THREE from 'three';
import {
  AnchorProjection,
  AnchorProjectorSources,
  IAnchorProjectionService,
  IAnchorProjector,
} from '../../core/interfaces/IAnchorProjector';
import { Vec3Like } from '../../core/interfaces/Vec3Like';
import { toThreeCamera, toThreeObject } from './unwrap';

const OCCLUSION_EPSILON = 1e-3;
const HIDDEN: AnchorProjection = { visible: false };

export class ThreeAnchorProjector implements IAnchorProjector {
  private readonly anchor = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly toAnchor = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();
  private readonly lastCameraMatrix = new THREE.Matrix4();
  private lastWidth = -1;
  private lastHeight = -1;
  private hasProjected = false;

  constructor(private readonly sources: AnchorProjectorSources) {}

  invalidate(): void {
    this.hasProjected = false;
  }

  project(point: Vec3Like, occlude: boolean): AnchorProjection | null {
    const camera = toThreeCamera(this.sources.camera);
    const canvas = this.sources.getCanvas();
    if (!camera || !canvas) {
      return null;
    }
    const width = canvas.clientWidth || canvas.width;
    const height = canvas.clientHeight || canvas.height;
    if (
      this.hasProjected &&
      width === this.lastWidth &&
      height === this.lastHeight &&
      this.lastCameraMatrix.equals(camera.matrixWorld)
    ) {
      return null;
    }
    this.lastCameraMatrix.copy(camera.matrixWorld);
    this.lastWidth = width;
    this.lastHeight = height;
    this.hasProjected = true;

    this.anchor.set(point.x, point.y, point.z);

    camera.getWorldPosition(this.cameraPosition);
    this.projected.copy(this.anchor).applyMatrix4(camera.matrixWorldInverse);
    if (this.projected.z >= 0) {
      return HIDDEN;
    }

    if (occlude && this.isOccluded(camera)) {
      return HIDDEN;
    }

    this.projected.copy(this.anchor).project(camera);
    return {
      visible: true,
      left: ((this.projected.x + 1) / 2) * width,
      top: ((1 - this.projected.y) / 2) * height,
    };
  }

  private isOccluded(camera: THREE.Camera): boolean {
    const model = toThreeObject(this.sources.getModel());
    if (!model) {
      return false;
    }
    this.toAnchor.copy(this.anchor).sub(this.cameraPosition);
    const anchorDistance = this.toAnchor.length();
    this.raycaster.set(this.cameraPosition, this.toAnchor.normalize());
    this.raycaster.camera = camera;
    this.raycaster.firstHitOnly = true;
    const hit = this.raycaster.intersectObject(model, true)[0];
    return Boolean(hit && hit.distance < anchorDistance - OCCLUSION_EPSILON);
  }
}

export class ThreeAnchorProjectionService implements IAnchorProjectionService {
  createProjector(sources: AnchorProjectorSources): IAnchorProjector {
    return new ThreeAnchorProjector(sources);
  }
}
