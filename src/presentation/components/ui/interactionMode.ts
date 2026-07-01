import * as THREE from 'three';
import { InteractionMode } from '../../../types/options';

/** The subset of OrbitControls/MapControls we remap for interaction modes. */
interface RemappableControls {
  mouseButtons?: { LEFT?: number; MIDDLE?: number; RIGHT?: number };
  touches?: { ONE?: number; TWO?: number };
}

const MOUSE_FOR_MODE: Record<InteractionMode, number> = {
  orbit: THREE.MOUSE.ROTATE,
  pan: THREE.MOUSE.PAN,
  zoom: THREE.MOUSE.DOLLY,
};

const TOUCH_FOR_MODE: Record<InteractionMode, number> = {
  orbit: THREE.TOUCH.ROTATE,
  pan: THREE.TOUCH.PAN,
  zoom: THREE.TOUCH.DOLLY_PAN,
};

/**
 * Point the primary drag (left mouse button / one-finger touch) at the chosen
 * interaction. The secondary bindings (right-drag pan, wheel/pinch zoom) are
 * left untouched, so the mode just picks what the main drag does.
 */
export function applyInteractionMode(controls: unknown, mode: InteractionMode): void {
  const remappable = controls as RemappableControls | null;
  if (!remappable) {
    return;
  }
  if (remappable.mouseButtons) {
    remappable.mouseButtons.LEFT = MOUSE_FOR_MODE[mode];
  }
  if (remappable.touches) {
    remappable.touches.ONE = TOUCH_FOR_MODE[mode];
  }
}
