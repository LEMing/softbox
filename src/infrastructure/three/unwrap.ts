import * as THREE from 'three';
import { ControlsInstance } from '../../types/CommonTypes';

/**
 * Canonical adapter unwrapping: core hands out engine-agnostic adapters
 * (`IScene`/`ICamera`/…); code that genuinely needs the underlying Three.js
 * object goes through these helpers instead of hand-rolling the
 * "call getThreeX() if present, else instanceof" duck-type at every site.
 * Returns null when the candidate is neither an adapter nor a raw object.
 */
const callUnwrap = <T>(candidate: unknown, method: string): T | null => {
  if (candidate && typeof candidate === 'object') {
    const accessor = (candidate as Record<string, unknown>)[method];
    if (typeof accessor === 'function') {
      return (accessor as () => T).call(candidate);
    }
  }
  return null;
};

export function toThreeObject(candidate: unknown): THREE.Object3D | null {
  return (
    callUnwrap<THREE.Object3D>(candidate, 'getThreeObject') ??
    (candidate instanceof THREE.Object3D ? candidate : null)
  );
}

export function toThreeCamera(candidate: unknown): THREE.Camera | null {
  return (
    callUnwrap<THREE.Camera>(candidate, 'getThreeCamera') ??
    (candidate instanceof THREE.Camera ? candidate : null)
  );
}

export function toThreeScene(candidate: unknown): THREE.Scene | null {
  return (
    callUnwrap<THREE.Scene>(candidate, 'getThreeScene') ??
    (candidate instanceof THREE.Scene ? candidate : null)
  );
}

export function toThreeRenderer(candidate: unknown): THREE.WebGLRenderer | null {
  return (
    callUnwrap<THREE.WebGLRenderer>(candidate, 'getThreeRenderer') ??
    (candidate instanceof THREE.WebGLRenderer ? candidate : null)
  );
}

/** Controls are a type union (no instanceof); only the adapter path applies. */
export function toThreeControls(candidate: unknown): ControlsInstance | null {
  return callUnwrap<ControlsInstance>(candidate, 'getThreeControls');
}
