import * as THREE from 'three';
import { ThreeSelectionService } from '../ThreeSelectionService';
import { ThreeObject3DAdapter } from '../ThreeObject3D';
import { SelectionPick } from '../../../core/services/ISelectionService';

const makeCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = jest.fn(() => ({
    left: 0,
    top: 0,
    width: 200,
    height: 200,
    right: 200,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
  return canvas;
};

const makeCamera = (): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
};

const makeBox = (): THREE.Mesh => {
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  box.updateMatrixWorld();
  return box;
};

interface PointerInit {
  pointerId?: number;
  button?: number;
  pointerType?: string;
}

const pointer = (
  type: string,
  clientX: number,
  clientY: number,
  { pointerId = 1, button = 0, pointerType = 'mouse' }: PointerInit = {}
) => {
  const event = new MouseEvent(type, { clientX, clientY, button });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  return event;
};

describe('ThreeSelectionService', () => {
  let canvas: HTMLCanvasElement;
  let onPick: jest.Mock;
  let service: ThreeSelectionService;

  const initialize = (root: THREE.Object3D | null) => {
    service.initialize({
      canvas,
      camera: { getThreeCamera: () => makeCamera() } as never,
      getPickRoot: () => (root ? new ThreeObject3DAdapter(root) : null),
      onPick,
    });
  };

  beforeEach(() => {
    canvas = makeCanvas();
    onPick = jest.fn();
    service = new ThreeSelectionService();
  });

  afterEach(() => {
    service.dispose();
  });

  it('reports the hit object and world-space point for a click on the model', () => {
    const box = makeBox();
    initialize(box);

    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointerup', 100, 100));

    expect(onPick).toHaveBeenCalledTimes(1);
    const pick = onPick.mock.calls[0][0] as SelectionPick;
    expect(pick).not.toBeNull();
    // The ray through the canvas center hits the box's front face at z=1.
    expect(pick.point.z).toBeCloseTo(1);
    expect((pick.object as ThreeObject3DAdapter).getThreeObject()).toBeInstanceOf(THREE.Mesh);
    // The pick root got a lazy BVH (models loaded as raw objects bypass the
    // loader's build) and the hit above went through the accelerated path.
    expect(
      (box.geometry as THREE.BufferGeometry & { boundsTree?: unknown }).boundsTree
    ).toBeTruthy();
  });

  it('treats exactly the threshold as a click and one pixel more as a drag', () => {
    initialize(makeBox());

    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointerup', 105, 100));
    expect(onPick).toHaveBeenCalledTimes(1);

    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointerup', 106, 100));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('gives touch a wider tap budget than mouse', () => {
    initialize(makeBox());

    canvas.dispatchEvent(pointer('pointerdown', 100, 100, { pointerType: 'touch' }));
    canvas.dispatchEvent(pointer('pointerup', 108, 100, { pointerType: 'touch' }));

    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('ignores orbit drags (pointer travelled beyond the click threshold)', () => {
    initialize(makeBox());

    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointerup', 140, 100));

    expect(onPick).not.toHaveBeenCalled();
  });

  it('ignores right and middle clicks (pan/dolly buttons)', () => {
    initialize(makeBox());

    canvas.dispatchEvent(pointer('pointerdown', 100, 100, { button: 2 }));
    canvas.dispatchEvent(pointer('pointerup', 100, 100, { button: 2 }));
    canvas.dispatchEvent(pointer('pointerdown', 100, 100, { button: 1 }));
    canvas.dispatchEvent(pointer('pointerup', 100, 100, { button: 1 }));

    expect(onPick).not.toHaveBeenCalled();
  });

  it('cancels the click when a second pointer joins (pinch zoom)', () => {
    initialize(makeBox());

    canvas.dispatchEvent(pointer('pointerdown', 100, 100, { pointerId: 1, pointerType: 'touch' }));
    canvas.dispatchEvent(pointer('pointerdown', 104, 100, { pointerId: 2, pointerType: 'touch' }));
    canvas.dispatchEvent(pointer('pointerup', 104, 100, { pointerId: 2, pointerType: 'touch' }));
    canvas.dispatchEvent(pointer('pointerup', 100, 100, { pointerId: 1, pointerType: 'touch' }));

    expect(onPick).not.toHaveBeenCalled();
  });

  it('forgets the press on pointercancel (OS gesture takeover)', () => {
    initialize(makeBox());

    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointercancel', 100, 100));
    canvas.dispatchEvent(pointer('pointerup', 100, 100));

    expect(onPick).not.toHaveBeenCalled();
  });

  it('reports null for a click that misses the model', () => {
    initialize(makeBox());

    // Top-left corner: the ray passes beside the 2x2 box.
    canvas.dispatchEvent(pointer('pointerdown', 2, 2));
    canvas.dispatchEvent(pointer('pointerup', 2, 2));

    expect(onPick).toHaveBeenCalledWith(null);
  });

  it('reports null while no model is loaded', () => {
    initialize(null);

    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointerup', 100, 100));

    expect(onPick).toHaveBeenCalledWith(null);
  });

  it('stops picking after dispose', () => {
    initialize(makeBox());
    service.dispose();

    canvas.dispatchEvent(pointer('pointerdown', 100, 100));
    canvas.dispatchEvent(pointer('pointerup', 100, 100));

    expect(onPick).not.toHaveBeenCalled();
  });
});
