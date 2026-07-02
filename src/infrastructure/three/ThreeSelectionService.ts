import * as THREE from 'three';
import {
  ISelectionService,
  SelectionServiceOptions,
} from '../../core/services/ISelectionService';
import { ThreeObject3DAdapter } from './ThreeObject3D';

const DRAG_THRESHOLD_PX = 5;

/**
 * Raycaster-based click picking. A pointerdown → pointerup pair that stays
 * within a few pixels counts as a click; orbit drags travel further and are
 * ignored, so rotating the camera never fires a selection.
 */
export class ThreeSelectionService implements ISelectionService {
  private readonly raycaster = new THREE.Raycaster();
  private options: SelectionServiceOptions | null = null;
  private downPosition: { x: number; y: number } | null = null;
  private detach: (() => void) | null = null;

  initialize(options: SelectionServiceOptions): void {
    this.dispose();
    this.options = options;

    const { canvas } = options;
    const handlePointerDown = (event: PointerEvent) => {
      this.downPosition = { x: event.clientX, y: event.clientY };
    };
    const handlePointerUp = (event: PointerEvent) => {
      const down = this.downPosition;
      this.downPosition = null;
      if (!down) {
        return;
      }
      const travelled = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      if (travelled > DRAG_THRESHOLD_PX) {
        return;
      }
      this.pick(event.clientX, event.clientY);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);
    this.detach = () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
    };
  }

  private pick(clientX: number, clientY: number): void {
    if (!this.options) {
      return;
    }
    const { canvas, camera, getPickRoot, onPick } = this.options;

    const root = getPickRoot();
    const threeRoot = this.unwrapObject(root);
    const threeCamera = this.unwrapCamera(camera);
    if (!threeRoot || !threeCamera) {
      onPick(null);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      onPick(null);
      return;
    }
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );

    this.raycaster.setFromCamera(ndc, threeCamera);
    const hit = this.raycaster.intersectObject(threeRoot, true)[0];
    if (!hit) {
      onPick(null);
      return;
    }
    onPick({
      object: new ThreeObject3DAdapter(hit.object),
      point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
    });
  }

  private unwrapObject(object: unknown): THREE.Object3D | null {
    if (object && typeof object === 'object') {
      const candidate = object as { getThreeObject?: () => THREE.Object3D };
      if (typeof candidate.getThreeObject === 'function') {
        return candidate.getThreeObject();
      }
      if (object instanceof THREE.Object3D) {
        return object;
      }
    }
    return null;
  }

  private unwrapCamera(camera: unknown): THREE.Camera | null {
    if (camera && typeof camera === 'object') {
      const candidate = camera as { getThreeCamera?: () => THREE.Camera };
      if (typeof candidate.getThreeCamera === 'function') {
        return candidate.getThreeCamera();
      }
      if (camera instanceof THREE.Camera) {
        return camera;
      }
    }
    return null;
  }

  dispose(): void {
    this.detach?.();
    this.detach = null;
    this.options = null;
    this.downPosition = null;
  }
}
