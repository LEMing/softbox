import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';

const EXTENSION = 'KHR_materials_variants';

/** Per-mesh map the resolver leaves behind: variant name → final material. */
export const VARIANT_MATERIALS_KEY = 'softboxVariantMaterials';
/** The mesh's authored material, for switching back to the default variant. */
export const DEFAULT_MATERIAL_KEY = 'softboxDefaultMaterial';

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
 * Eagerly resolve KHR_materials_variants while the GLTFParser is still alive.
 *
 * three's GLTFLoader does not implement the extension, but it faithfully
 * preserves what we need as "unknown extension" userData: the variant NAME
 * LIST on the gltf root and each primitive's variant→material MAPPINGS on
 * its mesh. This pass converts those index-based mappings into ready
 * `variantName → THREE.Material` maps stored on each mesh (materials run
 * through `assignFinalMaterial`, so per-geometry adaptations match what the
 * loader would produce) — after which the parser is no longer needed and
 * variant switching is a synchronous material swap.
 *
 * Leaves `gltf.userData.variants: string[]` for enumeration. No-op for
 * models without the extension.
 */
export async function resolveMaterialVariants(gltf: GLTF): Promise<void> {
  const rootExtension = (
    gltf.userData as { gltfExtensions?: Record<string, { variants?: Array<{ name: string }> }> }
  ).gltfExtensions?.[EXTENSION];
  const names = rootExtension?.variants?.map((variant) => variant.name);
  if (!names || names.length === 0) {
    return;
  }
  (gltf.userData as Record<string, unknown>).variants = names;

  const parser = gltf.parser as unknown as VariantCapableParser;
  const meshes: THREE.Mesh[] = [];
  gltf.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.userData.gltfExtensions?.[EXTENSION]) {
      meshes.push(mesh);
    }
  });

  await Promise.all(
    meshes.map(async (mesh) => {
      const extension = mesh.userData.gltfExtensions[EXTENSION] as MeshVariantExtensionDef;
      const mappings = extension.mappings ?? [];
      const authoredMaterial = mesh.material;
      const byName: Record<string, THREE.Material> = {};
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
      mesh.material = authoredMaterial;
      mesh.userData[VARIANT_MATERIALS_KEY] = byName;
      mesh.userData[DEFAULT_MATERIAL_KEY] = authoredMaterial;
    })
  );
}

/**
 * Switch a resolved model to `variant` (or back to the authored materials
 * with `null`). Synchronous: the resolver has already materialized every
 * variant. Returns whether any mesh actually changed.
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
