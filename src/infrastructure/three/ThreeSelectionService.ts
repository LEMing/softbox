import * as THREE from 'three';
import {
  ISelectionService,
  SelectionServiceOptions,
} from '../../core/services/ISelectionService';
import { ThreeObject3DAdapter } from './ThreeObject3D';
import { buildRaycastBvh } from './bvh';
import { toThreeCamera, toThreeObject } from './unwrap';

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
    const threeRoot = toThreeObject(root);
    const threeCamera = toThreeCamera(camera);
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

    // Models loaded as raw objects bypass the loader's BVH build; make sure
    // the pick root is accelerated before the first raycast (idempotent).
    // `selection.bvh: false` opts out here too — the whole point of the flag
    // is avoiding the build cost and the in-place index sort.
    if (this.options.bvh ?? true) {
      buildRaycastBvh(threeRoot);
    }

    this.raycaster.setFromCamera(ndc, threeCamera);
    // With a BVH, stopping at the closest hit skips the whole ordered-hits pass.
    this.raycaster.firstHitOnly = true;
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

  dispose(): void {
    this.detach?.();
    this.detach = null;
    this.options = null;
    this.pending = null;
    this.activePointers.clear();
  }
}
