import * as THREE from 'three';

/**
 * Canonical Three.js resource disposal helpers.
 *
 * All teardown paths funnel through here so that every GPU-backed resource
 * (geometry, material, the textures a material references, light shadow maps,
 * and scene background/environment textures) is released exactly once. Keeping
 * this in a single place prevents the "material.dispose() leaks its textures"
 * class of bug, where freeing a material does not free the maps attached to it.
 */

/**
 * Dispose a material and every Texture it references (map, normalMap,
 * roughnessMap, metalnessMap, aoMap, emissiveMap, etc.).
 *
 * Three.js `Material.dispose()` does NOT free attached textures, so we walk the
 * material's own properties and dispose any Texture found.
 */
export function disposeMaterial(material: THREE.Material): void {
  const properties = material as unknown as Record<string, unknown>;
  for (const key of Object.keys(properties)) {
    const value = properties[key];
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
  material.dispose();
}

/**
 * Recursively dispose an object's geometries, materials (with their textures),
 * and light shadow-map render targets. Does not detach the object from its
 * parent; callers that need that should remove it afterwards.
 */
export function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) {
        material.forEach(disposeMaterial);
      } else if (material) {
        disposeMaterial(material);
      }
    }

    const light = child as THREE.Light & { shadow?: { dispose?: () => void } };
    if (light.isLight && light.shadow?.dispose) {
      light.shadow.dispose();
    }
  });
}

/**
 * Dispose everything held by a scene: background/environment textures plus all
 * children (geometries, materials, textures, light shadows), then detach the
 * children so the scene graph is empty.
 */
export function disposeSceneContents(scene: THREE.Scene): void {
  if (scene.background instanceof THREE.Texture) {
    scene.background.dispose();
    scene.background = null;
  }
  if (scene.environment instanceof THREE.Texture) {
    scene.environment.dispose();
    scene.environment = null;
  }

  for (const child of [...scene.children]) {
    disposeObject3D(child);
    scene.remove(child);
  }
}
