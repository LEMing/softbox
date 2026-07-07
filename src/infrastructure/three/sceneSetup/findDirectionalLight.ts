import * as THREE from 'three';

export const findDirectionalLight = (root: THREE.Object3D): THREE.DirectionalLight | null => {
  let found: THREE.DirectionalLight | null = null;
  root.traverse((child) => {
    if (!found && (child as THREE.DirectionalLight).isDirectionalLight) {
      found = child as THREE.DirectionalLight;
    }
  });
  return found;
};
