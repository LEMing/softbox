import * as THREE from 'three';
import { ThreeAnchorProjector, ThreeAnchorProjectionService } from '../ThreeAnchorProjector';
import { ICamera, IObject3D } from '../../../core/interfaces';

const makeSources = (model: THREE.Object3D | null = null) => {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  Object.defineProperty(canvas, 'clientWidth', { value: 200, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: 200, configurable: true });

  const sources = {
    camera: { getThreeCamera: () => camera } as unknown as ICamera,
    getCanvas: () => canvas as HTMLCanvasElement | null,
    getModel: () => (model ? { getThreeObject: () => model } : null) as IObject3D | null,
  };
  return { sources, camera, canvas };
};

describe('ThreeAnchorProjector', () => {
  it('projects the world origin to the canvas center', () => {
    const { sources } = makeSources();
    const projector = new ThreeAnchorProjector(sources);

    const projection = projector.project({ x: 0, y: 0, z: 0 }, false);

    expect(projection).toEqual({ visible: true, left: 100, top: 100 });
  });

  it('reports an anchor behind the camera as not visible', () => {
    const { sources } = makeSources();
    const projector = new ThreeAnchorProjector(sources);

    expect(projector.project({ x: 0, y: 0, z: 10 }, false)).toEqual({ visible: false });
  });

  it('memoizes: an unchanged view returns null, a camera move recomputes', () => {
    const { sources, camera } = makeSources();
    const projector = new ThreeAnchorProjector(sources);
    const anchor = { x: 0, y: 0, z: 0 };

    expect(projector.project(anchor, false)).not.toBeNull();
    expect(projector.project(anchor, false)).toBeNull();

    camera.position.set(2, 0, 5);
    camera.updateMatrixWorld();
    const moved = projector.project(anchor, false);
    if (!moved || !moved.visible) {
      throw new Error('expected a visible recompute after the camera moved');
    }
    expect(moved.left).toBeLessThan(100);
  });

  it('invalidate() forces a recompute of an unchanged view', () => {
    const { sources } = makeSources();
    const projector = new ThreeAnchorProjector(sources);
    const anchor = { x: 0, y: 0, z: 0 };

    projector.project(anchor, false);
    expect(projector.project(anchor, false)).toBeNull();

    projector.invalidate();
    expect(projector.project(anchor, false)).toEqual({ visible: true, left: 100, top: 100 });
  });

  it('hides an anchor the model occludes, keeps a clear one visible', () => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial());
    wall.position.set(0, 0, 2);
    wall.updateMatrixWorld();
    const { sources } = makeSources(wall);
    const projector = new ThreeAnchorProjector(sources);

    expect(projector.project({ x: 0, y: 0, z: 0 }, true)).toEqual({ visible: false });

    wall.position.set(0, 0, -3);
    wall.updateMatrixWorld();
    projector.invalidate();
    const clear = projector.project({ x: 0, y: 0, z: 0 }, true);
    expect(clear && clear.visible).toBe(true);
  });

  it('treats a missing model as not occluding', () => {
    const { sources } = makeSources();
    const projector = new ThreeAnchorProjector(sources);

    const projection = projector.project({ x: 0, y: 0, z: 0 }, true);
    expect(projection && projection.visible).toBe(true);
  });

  it('returns null (keep previous placement) while the canvas is unavailable', () => {
    const { sources } = makeSources();
    const projector = new ThreeAnchorProjector({ ...sources, getCanvas: () => null });

    expect(projector.project({ x: 0, y: 0, z: 0 }, false)).toBeNull();
  });

  it('is produced by the service with per-projector memoization state', () => {
    const { sources } = makeSources();
    const service = new ThreeAnchorProjectionService();
    const first = service.createProjector(sources);
    const second = service.createProjector(sources);

    expect(first.project({ x: 0, y: 0, z: 0 }, false)).not.toBeNull();
    // A fresh projector has its own memo state, so it still recomputes.
    expect(second.project({ x: 0, y: 0, z: 0 }, false)).not.toBeNull();
  });
});
