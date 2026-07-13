import * as THREE from 'three';
import { disposeBoundsTree } from './bvh';

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
 * Marks a material whose textures are OWNED ELSEWHERE (an environment cache,
 * the scene background) — e.g. the grounded skybox, whose map is the cached
 * equirect HDRI that scene.background and the path tracer still reference.
 * Disposal frees such a material but leaves its textures to their owner;
 * without this, the screenshot flow's keepBackgrounds pass freed the very
 * texture it was preserving (a black sky on restore).
 */
export const EXTERNALLY_OWNED_TEXTURES_FLAG = 'softboxExternallyOwnedTextures';

/**
 * Marks a scene child that IS part of the backdrop (the grounded skybox):
 * `disposeSceneContents({ keepBackgrounds: true })` — the screenshot flow's
 * "free the heavy stuff but keep the backdrop restorable" pass — must leave
 * it in place, exactly like scene.background itself. Without this the pass
 * destroyed the projection and nothing ever recreated it.
 */
export const BACKGROUND_NODE_FLAG = 'softboxBackgroundNode';

/**
 * `Object3D.userData` key listing materials the object OWNS beyond the one
 * currently assigned (e.g. resolved KHR_materials_variants colorways).
 * {@link disposeObject3D} frees them together with the object — without this,
 * every variant the user never opened would survive the disposal walk.
 */
export const STASHED_MATERIALS_KEY = 'softboxStashedMaterials';

/**
 * Dispose a material and every Texture it references (map, normalMap,
 * roughnessMap, metalnessMap, aoMap, emissiveMap, etc.).
 *
 * Three.js `Material.dispose()` does NOT free attached textures, so we walk the
 * material's own properties and dispose any Texture found — unless the
 * material carries {@link EXTERNALLY_OWNED_TEXTURES_FLAG}.
 */
export function disposeMaterial(material: THREE.Material): void {
  // Idempotent: a material can be reachable through several owners (assigned
  // to a mesh AND stashed as a variant) — free its textures exactly once.
  if (material.userData.softboxDisposed) {
    return;
  }
  if (!material.userData?.[EXTERNALLY_OWNED_TEXTURES_FLAG]) {
    const properties = material as unknown as Record<string, unknown>;
    for (const key of Object.keys(properties)) {
      const value = properties[key];
      if (value instanceof THREE.Texture) {
        value.dispose();
      }
    }
    // Shader materials keep their textures inside uniforms.<name>.value, not as
    // direct properties — walk those too.
    const shader = material as THREE.ShaderMaterial;
    if (shader.isShaderMaterial && shader.uniforms) {
      for (const uniform of Object.values(shader.uniforms)) {
        if (uniform?.value instanceof THREE.Texture) {
          uniform.value.dispose();
        }
      }
    }
  }
  material.dispose();
  // Late async callbacks (e.g. a texture loader's onError firing after the
  // grid was torn down) consult this to avoid resurrecting dead materials.
  material.userData.softboxDisposed = true;
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
      disposeBoundsTree(renderable.geometry);
      renderable.geometry.dispose();
    }

    const material = renderable.material;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
    } else if (material) {
      disposeMaterial(material);
    }

    const stashed = child.userData?.[STASHED_MATERIALS_KEY] as THREE.Material[] | undefined;
    stashed?.forEach(disposeMaterial);

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
    if (options?.keepBackgrounds && child.userData?.[BACKGROUND_NODE_FLAG]) {
      continue;
    }
    disposeObject3D(child);
    scene.remove(child);
  }
}
