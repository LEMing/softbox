import * as THREE from 'three';
import {
  ISelectionService,
  SelectionServiceOptions,
} from '../../core/services/ISelectionService';
import { ThreeObject3DAdapter } from './ThreeObject3D';
import { buildRaycastBvh } from './bvh';
import { toThreeCamera, toThreeObject } from './unwrap';
import { bestEffort } from '../../utils/bestEffort';

const DRAG_THRESHOLD_PX = { touch: 10, default: 5 };

interface PendingClick {
  pointerId: number;
  x: number;
  y: number;
  threshold: number;
}

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
      bestEffort(() => canvas.setPointerCapture(event.pointerId));
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

    if (this.options.bvh ?? true) {
      buildRaycastBvh(threeRoot);
    }

    this.raycaster.setFromCamera(ndc, threeCamera);
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
