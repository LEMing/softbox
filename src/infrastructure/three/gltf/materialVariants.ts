import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { MODEL_VARIANT_NAMES_KEY } from '../../../core/interfaces/IModelLoader';
import { disposeMaterial, STASHED_MATERIALS_KEY } from '../disposal';

const EXTENSION = 'KHR_materials_variants';

/** Per-mesh map the resolver leaves behind: variant name → final material. */
export const VARIANT_MATERIALS_KEY = 'softboxVariantMaterials';
/** The mesh's authored material, for switching back to the default variant. */
export const DEFAULT_MATERIAL_KEY = 'softboxDefaultMaterial';
/** Root userData key holding the in-flight materialization promise. */
const RESOLUTION_KEY = 'softboxVariantResolution';

interface VariantMappingDef {
  material: number;
  variants: number[];
}

interface MeshVariantExtensionDef {
  mappings?: VariantMappingDef[];
}

/** The slice of GLTFParser the resolver uses (assignFinalMaterial is real but
 * untyped in three's public defs). */
interface VariantCapableParser {
  getDependency(type: 'material', index: number): Promise<THREE.Material>;
  assignFinalMaterial(mesh: THREE.Mesh): void;
}

/**
 * Kick off KHR_materials_variants resolution for a freshly parsed model.
 *
 * three's GLTFLoader does not implement the extension, but it faithfully
 * preserves what we need as "unknown extension" userData: the variant NAME
 * LIST on the gltf root and each primitive's variant→material MAPPINGS on
 * its mesh. The name list is published synchronously under
 * {@link MODEL_VARIANT_NAMES_KEY}; the materials themselves materialize in
 * the BACKGROUND — a variant can carry texture sets the user never opens,
 * and first paint must not wait for them. Appliers await
 * {@link whenMaterialVariantsResolved} before switching.
 *
 * Must be called while the parser is still alive (inside onLoad): materials
 * run through the parser's own `getDependency`/`assignFinalMaterial`, so
 * per-geometry adaptations match what the loader itself would produce. After
 * resolution the parser is no longer needed and switching is a synchronous
 * material swap. No-op for models without the extension; a resolution
 * failure only costs the variants feature, never the model.
 */
export function beginMaterialVariantResolution(gltf: GLTF): void {
  const rootExtension = (
    gltf.userData as { gltfExtensions?: Record<string, { variants?: Array<{ name?: unknown }> }> }
  ).gltfExtensions?.[EXTENSION];
  const names = (rootExtension?.variants ?? [])
    .map((variant) => variant.name)
    .filter((name): name is string => typeof name === 'string');
  if (names.length === 0) {
    return;
  }
  (gltf.userData as Record<string, unknown>)[MODEL_VARIANT_NAMES_KEY] = names;
  gltf.scene.userData[RESOLUTION_KEY] = resolveVariantMaterials(gltf, names).catch((error) => {
    console.warn('Failed to resolve material variants:', error);
  });
}

/**
 * Settles once the background materialization kicked off by
 * {@link beginMaterialVariantResolution} finishes (immediately for models
 * without variants — including on failure, which the resolution swallows
 * after restoring the authored materials). Traverses because a units-scale
 * wrap may have put a group above the gltf scene root.
 */
export function whenMaterialVariantsResolved(root: THREE.Object3D): Promise<void> {
  const pending: Array<Promise<void>> = [];
  root.traverse((object) => {
    const resolution = object.userData[RESOLUTION_KEY] as Promise<void> | undefined;
    if (resolution) {
      pending.push(resolution);
    }
  });
  return Promise.all(pending).then(() => undefined);
}

async function resolveVariantMaterials(gltf: GLTF, names: string[]): Promise<void> {
  const parser = gltf.parser as unknown as VariantCapableParser;
  const meshes: THREE.Mesh[] = [];
  gltf.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.userData.gltfExtensions?.[EXTENSION]) {
      meshes.push(mesh);
    }
  });

  await Promise.all(meshes.map((mesh) => resolveMeshVariants(mesh, parser, names)));
}

async function resolveMeshVariants(
  mesh: THREE.Mesh,
  parser: VariantCapableParser,
  names: string[]
): Promise<void> {
  const extension = mesh.userData.gltfExtensions[EXTENSION] as MeshVariantExtensionDef;
  const mappings = extension.mappings ?? [];
  const authoredMaterial = mesh.material;
  const byName: Record<string, THREE.Material> = {};
  try {
    for (const mapping of mappings) {
      const rawMaterial = await parser.getDependency('material', mapping.material);
      // assignFinalMaterial derives the geometry-adapted material exactly
      // like the loader's own path (vertex colors, flat shading, …); it
      // reads and writes mesh.material, so swap in/out around the call.
      mesh.material = rawMaterial;
      parser.assignFinalMaterial(mesh);
      const finalMaterial = mesh.material as THREE.Material;
      for (const variantIndex of mapping.variants) {
        const name = names[variantIndex];
        if (name !== undefined) {
          byName[name] = finalMaterial;
        }
      }
    }
  } finally {
    // A mid-resolution failure (one variant's texture 404s) must never leave
    // a half-swapped material on screen — the authored look always survives.
    mesh.material = authoredMaterial;
  }

  const variantMaterials = [...new Set(Object.values(byName))];
  const authoredList = Array.isArray(authoredMaterial) ? authoredMaterial : [authoredMaterial];
  if (authoredList.some((material) => material.userData.softboxDisposed)) {
    // The model was disposed while materialization was in flight — free the
    // fresh materials instead of stashing them on a dead mesh.
    variantMaterials.forEach(disposeMaterial);
    return;
  }
  mesh.userData[VARIANT_MATERIALS_KEY] = byName;
  mesh.userData[DEFAULT_MATERIAL_KEY] = authoredMaterial;
  // Hand every owned material (the colorways AND the authored default, which
  // may not be assigned at teardown time) to the disposal walk; disposal is
  // idempotent, so overlap with the assigned material is fine.
  mesh.userData[STASHED_MATERIALS_KEY] = [...new Set([...variantMaterials, ...authoredList])];
}

/**
 * Switch a resolved model to `variant` (or back to the authored materials
 * with `null`). Synchronous: callers await {@link whenMaterialVariantsResolved}
 * first, after which every variant is materialized. Returns whether any mesh
 * actually changed.
 */
export function applyMaterialVariant(root: THREE.Object3D, variant: string | null): boolean {
  let changed = false;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.userData[VARIANT_MATERIALS_KEY]) {
      return;
    }
    const byName = mesh.userData[VARIANT_MATERIALS_KEY] as Record<string, THREE.Material>;
    const target =
      (variant !== null ? byName[variant] : undefined) ??
      (mesh.userData[DEFAULT_MATERIAL_KEY] as THREE.Material);
    if (mesh.material !== target) {
      mesh.material = target;
      changed = true;
    }
  });
  return changed;
}
