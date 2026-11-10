import * as THREE from 'three';
import { ControlsInstance } from '../../types/CommonTypes';

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

export function toThreeTexture(candidate: unknown): THREE.Texture | null {
  return (
    callUnwrap<THREE.Texture>(candidate, 'getThreeTexture') ??
    (candidate instanceof THREE.Texture ? candidate : null)
  );
}

export function toThreeRenderer(candidate: unknown): THREE.WebGLRenderer | null {
  return (
    callUnwrap<THREE.WebGLRenderer>(candidate, 'getThreeRenderer') ??
    (candidate instanceof THREE.WebGLRenderer ? candidate : null)
  );
}

export function toThreeControls(candidate: unknown): ControlsInstance | null {
  return callUnwrap<ControlsInstance>(candidate, 'getThreeControls');
}
