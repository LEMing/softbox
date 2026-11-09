import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { MODEL_VARIANT_NAMES_KEY } from '../../../core/interfaces/IModelLoader';
import { disposeMaterial, STASHED_MATERIALS_KEY } from '../disposal';

const EXTENSION = 'KHR_materials_variants';

export const VARIANT_MATERIALS_KEY = 'softboxVariantMaterials';
export const DEFAULT_MATERIAL_KEY = 'softboxDefaultMaterial';
const RESOLUTION_KEY = 'softboxVariantResolution';

interface VariantMappingDef {
  material: number;
  variants: number[];
}

interface MeshVariantExtensionDef {
  mappings?: VariantMappingDef[];
}

interface VariantCapableParser {
  getDependency(type: 'material', index: number): Promise<THREE.Material>;
  assignFinalMaterial(mesh: THREE.Mesh): void;
}

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
    mesh.material = authoredMaterial;
  }

  const variantMaterials = [...new Set(Object.values(byName))];
  const authoredList = Array.isArray(authoredMaterial) ? authoredMaterial : [authoredMaterial];
  if (authoredList.some((material) => material.userData.softboxDisposed)) {
    variantMaterials.forEach(disposeMaterial);
    return;
  }
  mesh.userData[VARIANT_MATERIALS_KEY] = byName;
  mesh.userData[DEFAULT_MATERIAL_KEY] = authoredMaterial;
  mesh.userData[STASHED_MATERIALS_KEY] = [...new Set([...variantMaterials, ...authoredList])];
}

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
