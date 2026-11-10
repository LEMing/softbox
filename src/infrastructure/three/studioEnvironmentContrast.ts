import * as THREE from 'three';

const SURROUND_DARKEN = 0.42;
const PANEL_BOOST = 1.15;
const FILL_LIGHT_SCALE = 0.7;

const PANEL_EMISSIVE_THRESHOLD = 1;

export function applyStudioContrast(root: THREE.Object3D): void {
  root.traverse((object) => {
    const light = object as THREE.PointLight;
    if (light.isPointLight) {
      light.intensity *= FILL_LIGHT_SCALE;
      return;
    }

    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }
      const mat = material as THREE.MeshStandardMaterial;
      const isSoftBoxPanel = (mat.emissiveIntensity ?? 0) > PANEL_EMISSIVE_THRESHOLD;
      if (isSoftBoxPanel) {
        mat.emissiveIntensity *= PANEL_BOOST;
      } else if (mat.color) {
        mat.color.multiplyScalar(SURROUND_DARKEN);
      }
    }
  });
}
