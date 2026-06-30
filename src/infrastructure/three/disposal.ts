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
 * and light shadow-map render targets. Covers every renderable that carries
 * geometry/material — meshes, lines (grids, axes helpers), points, sprites —
 * not just meshes. Does not detach the object from its parent.
 */
export function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    const renderable = child as Partial<{
      geometry: THREE.BufferGeometry;
      material: THREE.Material | THREE.Material[];
    }>;

    if (renderable.geometry && typeof renderable.geometry.dispose === 'function') {
      renderable.geometry.dispose();
    }

    const material = renderable.material;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
    } else if (material) {
      disposeMaterial(material);
    }

    const light = child as THREE.Light & { shadow?: { dispose?: () => void } };
    if (light.isLight && light.shadow?.dispose) {
      light.shadow.dispose();
    }
  });
}

export interface DisposeSceneOptions {
  /**
   * Keep `scene.background` / `scene.environment` textures alive. Used by the
   * screenshot flow, which frees heavy geometry but must preserve the background
   * so the scene can be restored when the user dismisses the screenshot.
   */
  keepBackgrounds?: boolean;
}

/**
 * Dispose everything held by a scene: all children (geometries, materials,
 * textures, light shadows) and, unless {@link DisposeSceneOptions.keepBackgrounds}
 * is set, the background/environment textures. Detaches the children so the
 * scene graph is empty.
 */
export function disposeSceneContents(scene: THREE.Scene, options?: DisposeSceneOptions): void {
  if (!options?.keepBackgrounds) {
    if (scene.background instanceof THREE.Texture) {
      scene.background.dispose();
      scene.background = null;
    }
    if (scene.environment instanceof THREE.Texture) {
      scene.environment.dispose();
      scene.environment = null;
    }
    // The path tracer keeps a back-reference to the equirectangular original on
    // the scene; clear it so it can't point at a texture we just disposed.
    const sceneWithOriginal = scene as THREE.Scene & { __originalEnvironmentTexture?: THREE.Texture };
    if (sceneWithOriginal.__originalEnvironmentTexture) {
      sceneWithOriginal.__originalEnvironmentTexture = undefined;
    }
  }

  for (const child of [...scene.children]) {
    disposeObject3D(child);
    scene.remove(child);
  }
}
