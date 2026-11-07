import * as THREE from 'three';
import {
  applyMaterialVariant,
  beginMaterialVariantResolution,
  whenMaterialVariantsResolved,
  DEFAULT_MATERIAL_KEY,
  VARIANT_MATERIALS_KEY,
} from '../materialVariants';
import { MODEL_VARIANT_NAMES_KEY } from '../../../../core/interfaces/IModelLoader';
import { STASHED_MATERIALS_KEY } from '../../disposal';
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

const resolve = async (gltf: GLTF) => {
  beginMaterialVariantResolution(gltf);
  await whenMaterialVariantsResolved(gltf.scene);
};

describe('beginMaterialVariantResolution', () => {
  it('publishes the name list synchronously, under the namespaced key', () => {
    const { gltf } = makeVariantGltf();
    beginMaterialVariantResolution(gltf);
    expect((gltf.userData as Record<string, unknown>)[MODEL_VARIANT_NAMES_KEY]).toEqual([
      'beach',
      'midnight',
    ]);
  });

  it('materializes variant-name → material maps in the background', async () => {
    const { gltf, mesh, authored, beach, midnight } = makeVariantGltf();
    await resolve(gltf);

    const byName = mesh.userData[VARIANT_MATERIALS_KEY] as Record<string, THREE.Material>;
    expect(byName.beach).toBe(beach);
    expect(byName.midnight).toBe(midnight);
    // The authored material stays assigned and is remembered for resets.
    expect(mesh.material).toBe(authored);
    expect(mesh.userData[DEFAULT_MATERIAL_KEY]).toBe(authored);
  });

  it('runs each variant material through assignFinalMaterial (geometry adaptations)', async () => {
    const { gltf, parser } = makeVariantGltf();
    await resolve(gltf);
    expect(parser.assignFinalMaterial).toHaveBeenCalledTimes(2);
  });

  it('hands every owned material to the disposal walk via the stash', async () => {
    const { gltf, mesh, authored, beach, midnight } = makeVariantGltf();
    await resolve(gltf);

    const stashed = mesh.userData[STASHED_MATERIALS_KEY] as THREE.Material[];
    expect(stashed).toEqual(expect.arrayContaining([authored, beach, midnight]));
  });

  it('is a no-op for models without the extension', async () => {
    const scene = new THREE.Group();
    const gltf = { scene, parser: {}, userData: {} } as unknown as GLTF;
    beginMaterialVariantResolution(gltf);
    expect((gltf.userData as Record<string, unknown>)[MODEL_VARIANT_NAMES_KEY]).toBeUndefined();
    await expect(whenMaterialVariantsResolved(scene)).resolves.toBeUndefined();
  });

  it('drops non-string variant names from a malformed extension', () => {
    const { gltf } = makeVariantGltf();
    (gltf.userData as { gltfExtensions: Record<string, { variants: unknown[] }> }).gltfExtensions[
      EXTENSION
    ].variants = [{ name: 'beach' }, { name: 42 }, {}];
    beginMaterialVariantResolution(gltf);
    expect((gltf.userData as Record<string, unknown>)[MODEL_VARIANT_NAMES_KEY]).toEqual(['beach']);
  });

  it('restores the authored material when a variant fails to materialize mid-loop', async () => {
    const { gltf, mesh, authored, parser } = makeVariantGltf();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    parser.getDependency
      .mockImplementationOnce(async () => new THREE.MeshStandardMaterial())
      .mockImplementationOnce(async () => {
        throw new Error('texture 404');
      });

    await resolve(gltf);

    expect(mesh.material).toBe(authored);
    // The half-resolved mesh carries no variant maps — applying stays a no-op.
    expect(mesh.userData[VARIANT_MATERIALS_KEY]).toBeUndefined();
    expect(applyMaterialVariant(gltf.scene, 'beach')).toBe(false);
    expect(warn).toHaveBeenCalledWith('Failed to resolve material variants:', expect.any(Error));
    warn.mockRestore();
  });

  it('disposes freshly materialized materials instead of stashing them on a disposed mesh', async () => {
    const { gltf, mesh, authored, beach, midnight } = makeVariantGltf();
    beginMaterialVariantResolution(gltf);
    // The disposal walk ran while materialization was still in flight.
    authored.userData.softboxDisposed = true;
    const beachDispose = jest.spyOn(beach, 'dispose');
    const midnightDispose = jest.spyOn(midnight, 'dispose');

    await whenMaterialVariantsResolved(gltf.scene);

    expect(beachDispose).toHaveBeenCalled();
    expect(midnightDispose).toHaveBeenCalled();
    expect(mesh.userData[VARIANT_MATERIALS_KEY]).toBeUndefined();
    expect(mesh.userData[STASHED_MATERIALS_KEY]).toBeUndefined();
  });
});

describe('whenMaterialVariantsResolved', () => {
  it('finds the resolution through a wrapping group (units-scale wrap)', async () => {
    const { gltf, mesh, beach } = makeVariantGltf();
    beginMaterialVariantResolution(gltf);
    const wrap = new THREE.Group();
    wrap.add(gltf.scene);

    await whenMaterialVariantsResolved(wrap);

    expect((mesh.userData[VARIANT_MATERIALS_KEY] as Record<string, THREE.Material>).beach).toBe(
      beach
    );
  });
});

describe('applyMaterialVariant', () => {
  it('switches to a variant, back to another, and resets to the authored material', async () => {
    const { gltf, mesh, authored, beach, midnight } = makeVariantGltf();
    await resolve(gltf);

    expect(applyMaterialVariant(gltf.scene, 'beach')).toBe(true);
    expect(mesh.material).toBe(beach);

    expect(applyMaterialVariant(gltf.scene, 'midnight')).toBe(true);
    expect(mesh.material).toBe(midnight);

    expect(applyMaterialVariant(gltf.scene, null)).toBe(true);
    expect(mesh.material).toBe(authored);
  });

  it('reports no change when re-applying the current variant', async () => {
    const { gltf } = makeVariantGltf();
    await resolve(gltf);
    applyMaterialVariant(gltf.scene, 'beach');
    expect(applyMaterialVariant(gltf.scene, 'beach')).toBe(false);
  });

  it('falls back to the authored material for an unknown variant name', async () => {
    const { gltf, mesh, authored } = makeVariantGltf();
    await resolve(gltf);
    applyMaterialVariant(gltf.scene, 'beach');
    expect(applyMaterialVariant(gltf.scene, 'nope')).toBe(true);
    expect(mesh.material).toBe(authored);
  });

  it('ignores meshes without variant data', () => {
    const plain = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    expect(applyMaterialVariant(plain, 'beach')).toBe(false);
  });
});
