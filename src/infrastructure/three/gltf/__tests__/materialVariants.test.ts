import * as THREE from 'three';
import {
  applyMaterialVariant,
  resolveMaterialVariants,
  DEFAULT_MATERIAL_KEY,
  VARIANT_MATERIALS_KEY,
} from '../materialVariants';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';

const EXTENSION = 'KHR_materials_variants';

const makeVariantGltf = () => {
  const scene = new THREE.Group();
  const authored = new THREE.MeshStandardMaterial({ name: 'authored' });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), authored);
  mesh.userData.gltfExtensions = {
    [EXTENSION]: { mappings: [{ material: 0, variants: [0] }, { material: 1, variants: [1] }] },
  };
  scene.add(mesh);

  const beach = new THREE.MeshStandardMaterial({ name: 'beach' });
  const midnight = new THREE.MeshStandardMaterial({ name: 'midnight' });
  const materials = [beach, midnight];
  const parser = {
    getDependency: jest.fn(async (_type: string, index: number) => materials[index]),
    // The real assignFinalMaterial may swap mesh.material for a derived
    // clone; the pass-through shape is enough to pin the call order.
    assignFinalMaterial: jest.fn(),
  };
  const gltf = {
    scene,
    parser,
    userData: {
      gltfExtensions: { [EXTENSION]: { variants: [{ name: 'beach' }, { name: 'midnight' }] } },
    },
  } as unknown as GLTF;
  return { gltf, mesh, authored, beach, midnight, parser };
};

describe('resolveMaterialVariants', () => {
  it('materializes variant-name → material maps and the enumeration list', async () => {
    const { gltf, mesh, authored, beach, midnight } = makeVariantGltf();
    await resolveMaterialVariants(gltf);

    expect((gltf.userData as { variants?: string[] }).variants).toEqual(['beach', 'midnight']);
    const byName = mesh.userData[VARIANT_MATERIALS_KEY] as Record<string, THREE.Material>;
    expect(byName.beach).toBe(beach);
    expect(byName.midnight).toBe(midnight);
    // The authored material stays assigned and is remembered for resets.
    expect(mesh.material).toBe(authored);
    expect(mesh.userData[DEFAULT_MATERIAL_KEY]).toBe(authored);
  });

  it('runs each variant material through assignFinalMaterial (geometry adaptations)', async () => {
    const { gltf, parser } = makeVariantGltf();
    await resolveMaterialVariants(gltf);
    expect(parser.assignFinalMaterial).toHaveBeenCalledTimes(2);
  });

  it('is a no-op for models without the extension', async () => {
    const scene = new THREE.Group();
    const gltf = { scene, parser: {}, userData: {} } as unknown as GLTF;
    await expect(resolveMaterialVariants(gltf)).resolves.toBeUndefined();
    expect((gltf.userData as { variants?: string[] }).variants).toBeUndefined();
  });
});

describe('applyMaterialVariant', () => {
  it('switches to a variant, back to another, and resets to the authored material', async () => {
    const { gltf, mesh, authored, beach, midnight } = makeVariantGltf();
    await resolveMaterialVariants(gltf);

    expect(applyMaterialVariant(gltf.scene, 'beach')).toBe(true);
    expect(mesh.material).toBe(beach);

    expect(applyMaterialVariant(gltf.scene, 'midnight')).toBe(true);
    expect(mesh.material).toBe(midnight);

    expect(applyMaterialVariant(gltf.scene, null)).toBe(true);
    expect(mesh.material).toBe(authored);
  });

  it('reports no change when re-applying the current variant', async () => {
    const { gltf } = makeVariantGltf();
    await resolveMaterialVariants(gltf);
    applyMaterialVariant(gltf.scene, 'beach');
    expect(applyMaterialVariant(gltf.scene, 'beach')).toBe(false);
  });

  it('falls back to the authored material for an unknown variant name', async () => {
    const { gltf, mesh, authored } = makeVariantGltf();
    await resolveMaterialVariants(gltf);
    applyMaterialVariant(gltf.scene, 'beach');
    expect(applyMaterialVariant(gltf.scene, 'nope')).toBe(true);
    expect(mesh.material).toBe(authored);
  });

  it('ignores meshes without variant data', () => {
    const plain = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    expect(applyMaterialVariant(plain, 'beach')).toBe(false);
  });
});
