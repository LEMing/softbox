import * as THREE from 'three';
import {
  ISelectionService,
  SelectionServiceOptions,
} from '../../core/services/ISelectionService';
import { ThreeObject3DAdapter } from './ThreeObject3D';

// Typical tap slop is larger than mouse jitter, so touch gets a wider budget.
const DRAG_THRESHOLD_PX = { touch: 10, default: 5 };

interface PendingClick {
  pointerId: number;
  x: number;
  y: number;
  threshold: number;
}

/**
 * Raycaster-based click picking. Only a primary-button, single-pointer
 * press → release pair that stays within the tap threshold counts as a click:
 * orbit drags travel further, right/middle buttons pan/dolly, and a second
 * pointer (pinch zoom) cancels the gesture — none of them fire a selection.
 */
export class ThreeSelectionService implements ISelectionService {
  private readonly raycaster = new THREE.Raycaster();
  private readonly activePointers = new Set<number>();
  private options: SelectionServiceOptions | null = null;
  private pending: PendingClick | null = null;
  private detach: (() => void) | null = null;

  initialize(options: SelectionServiceOptions): void {
    this.dispose();
    this.options = options;

    const { canvas } = options;
    const handlePointerDown = (event: PointerEvent) => {
      this.activePointers.add(event.pointerId);
      // Capture so the matching pointerup reaches the canvas even when the
      // pointer is released elsewhere (OrbitControls captures the same way).
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Unsupported environment (jsdom) — the listener pair still works.
      }
      // Any second concurrent pointer means a multi-touch gesture, not a click.
      if (this.activePointers.size > 1 || event.button !== 0) {
        this.pending = null;
        return;
      }
      this.pending = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        threshold:
          event.pointerType === 'touch' ? DRAG_THRESHOLD_PX.touch : DRAG_THRESHOLD_PX.default,
      };
    };
    const handlePointerUp = (event: PointerEvent) => {
      this.activePointers.delete(event.pointerId);
      const pending = this.pending;
      if (!pending || pending.pointerId !== event.pointerId) {
        return;
      }
      this.pending = null;
      const travelled = Math.hypot(event.clientX - pending.x, event.clientY - pending.y);
      if (travelled > pending.threshold) {
        return;
      }
      this.pick(event.clientX, event.clientY);
    };
    const handlePointerCancel = (event: PointerEvent) => {
      this.activePointers.delete(event.pointerId);
      this.pending = null;
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerCancel);
    this.detach = () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerCancel);
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
    this.pending = null;
    this.activePointers.clear();
  }
}
