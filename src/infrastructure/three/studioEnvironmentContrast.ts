import * as THREE from 'three';

/**
 * Push the stock RoomEnvironment toward a higher-contrast "studio" look: darken
 * the reflected surround (the room walls + furniture boxes) and slightly
 * concentrate the emissive soft-box panels, so glossy materials show crisp,
 * distinct highlights against a deeper background instead of an even, flat wash.
 *
 * RoomEnvironment lights its surfaces with a single point light and marks its
 * soft-boxes with a high `emissiveIntensity`; we discriminate the two by that
 * intensity. Mutates the scene in place, so run it BEFORE PMREM and the path
 * tracer's cube capture (which share this one scene) — both then get the same
 * contrastier environment.
 */
const SURROUND_DARKEN = 0.42; // reflected walls/boxes → darker, so panels pop
const PANEL_BOOST = 1.15; // emissive soft-boxes → a touch punchier
const FILL_LIGHT_SCALE = 0.7; // room point light → deeper unlit corners

/** Intensity above which an emissive material is treated as a soft-box panel. */
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
