import * as THREE from 'three';
import { ThreeGLTFLoaderAdapter, ModelLoaderFactory } from '../ThreeModelLoader';
import { ErrorCode } from '../../../errors';
import { gltfInstances, resetGltfMock, setNextGltf } from '../../../__mocks__/GLTFLoaderMock';
import {
  VARIANT_MATERIALS_KEY,
  whenMaterialVariantsResolved,
} from '../gltf/materialVariants';
import { MODEL_VARIANT_NAMES_KEY } from '../../../core/interfaces/IModelLoader';
import { dracoInstances, resetDracoMock } from '../../../__mocks__/DRACOLoaderMock';
import { ktx2Instances, resetKtx2Mock } from '../../../__mocks__/KTX2LoaderMock';
import { MeshoptDecoder } from '../../../__mocks__/MeshoptDecoderMock';

const revision = THREE.REVISION.replace(/\D/g, '');
const DEFAULT_DRACO_PATH = `https://cdn.jsdelivr.net/npm/three@0.${revision}/examples/jsm/libs/draco/`;
const DEFAULT_KTX2_PATH = `https://cdn.jsdelivr.net/npm/three@0.${revision}/examples/jsm/libs/basis/`;

/** Decoders configure lazily on first load — drive them through a real load. */
const loadWith = async (config = {}) => {
  const adapter = new ThreeGLTFLoaderAdapter(config);
  await adapter.load('model.glb');
  return adapter;
};

describe('ThreeGLTFLoaderAdapter', () => {
  beforeEach(() => {
    resetGltfMock();
    resetDracoMock();
    resetKtx2Mock();
  });

  const gltf = () => gltfInstances[0];

  describe('decoder wiring', () => {
    it('does not touch the decoders until the first load (lazy)', () => {
      new ThreeGLTFLoaderAdapter();
      expect(dracoInstances).toHaveLength(0);
      expect(ktx2Instances).toHaveLength(0);
    });

    it('wires DRACO, KTX2 and Meshopt by default on first load', async () => {
      await loadWith();

      expect(dracoInstances).toHaveLength(1);
      expect(ktx2Instances).toHaveLength(1);
      expect(gltf().setDRACOLoader).toHaveBeenCalledWith(dracoInstances[0]);
      expect(gltf().setKTX2Loader).toHaveBeenCalledWith(ktx2Instances[0]);
      expect(gltf().setMeshoptDecoder).toHaveBeenCalledWith(MeshoptDecoder);
    });

    it('configures the decoders only once across multiple loads', async () => {
      const adapter = new ThreeGLTFLoaderAdapter();
      await adapter.load('a.glb');
      await adapter.load('b.glb');

      expect(dracoInstances).toHaveLength(1);
      expect(ktx2Instances).toHaveLength(1);
    });

    it('defaults the decoder paths to a version-pinned CDN matching the installed Three.js', async () => {
      await loadWith();

      expect(dracoInstances[0].setDecoderPath).toHaveBeenCalledWith(DEFAULT_DRACO_PATH);
      expect(ktx2Instances[0].setTranscoderPath).toHaveBeenCalledWith(DEFAULT_KTX2_PATH);
    });

    it('honors custom self-hosted decoder paths', async () => {
      await loadWith({
        dracoDecoderPath: '/vendor/draco/',
        ktx2TranscoderPath: '/vendor/basis/',
      });

      expect(dracoInstances[0].setDecoderPath).toHaveBeenCalledWith('/vendor/draco/');
      expect(ktx2Instances[0].setTranscoderPath).toHaveBeenCalledWith('/vendor/basis/');
    });

    it('detects KTX2 GPU support when a renderer is provided', async () => {
      const renderer = {} as THREE.WebGLRenderer;
      await loadWith({ renderer });

      expect(ktx2Instances[0].detectSupport).toHaveBeenCalledWith(renderer);
    });

    it('skips KTX2 support detection when no renderer is provided', async () => {
      await loadWith();

      expect(ktx2Instances[0].detectSupport).not.toHaveBeenCalled();
    });

    it('skips a decoder that is turned off', async () => {
      await loadWith({ draco: false, meshopt: false });

      expect(dracoInstances).toHaveLength(0);
      expect(ktx2Instances).toHaveLength(1);
      expect(gltf().setDRACOLoader).not.toHaveBeenCalled();
      expect(gltf().setMeshoptDecoder).not.toHaveBeenCalled();
      expect(gltf().setKTX2Loader).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('disposes the DRACO and KTX2 worker pools', async () => {
      const adapter = await loadWith();
      adapter.dispose();

      expect(dracoInstances[0].dispose).toHaveBeenCalledTimes(1);
      expect(ktx2Instances[0].dispose).toHaveBeenCalledTimes(1);
    });

    it('is a no-op for decoders that were never created', () => {
      const adapter = new ThreeGLTFLoaderAdapter({ draco: false, ktx2: false });
      expect(() => adapter.dispose()).not.toThrow();
    });
  });

  describe('supports', () => {
    it.each(['model.glb', 'scene.gltf', 'HTTP://x/A.GLB'])('accepts %s', (url) => {
      expect(new ThreeGLTFLoaderAdapter().supports(url)).toBe(true);
    });

    it.each(['model.fbx', 'model.obj', 'noext'])('rejects %s', (url) => {
      expect(new ThreeGLTFLoaderAdapter().supports(url)).toBe(false);
    });
  });

  describe('load', () => {
    it('resolves an IModel from the underlying GLTFLoader', async () => {
      const adapter = new ThreeGLTFLoaderAdapter();
      const result = await adapter.load('model.glb');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scene).toBeDefined();
      }
    });

    it('resolves Result.err when the load callback body throws (never hangs)', async () => {
      // A crash while adapting the parsed scene (BVH build, conversion) must
      // surface as MODEL_LOAD_FAILED through GLTFLoader's throw→onError
      // routing — an async callback would swallow it and hang the load.
      setNextGltf({
        scene: {
          traverse: () => {
            throw new Error('corrupt scene');
          },
        },
        animations: [],
      });

      const adapter = new ThreeGLTFLoaderAdapter();
      const result = await adapter.load('model.glb');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.MODEL_LOAD_FAILED);
      }
    });

    it('publishes variant names at once but does not hold the load for materialization', async () => {
      const scene = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
      mesh.userData.gltfExtensions = {
        KHR_materials_variants: { mappings: [{ material: 0, variants: [0] }] },
      };
      scene.add(mesh);
      let releaseMaterial!: (material: THREE.Material) => void;
      const gatedMaterial = new Promise<THREE.Material>((res) => {
        releaseMaterial = res;
      });
      setNextGltf({
        scene,
        animations: [],
        parser: { getDependency: () => gatedMaterial, assignFinalMaterial: () => undefined },
        userData: {
          gltfExtensions: { KHR_materials_variants: { variants: [{ name: 'beach' }] } },
        },
      });

      const adapter = new ThreeGLTFLoaderAdapter();
      // Resolves while the variant material is still gated — first paint
      // must not wait for colorway textures the user may never open.
      const result = await adapter.load('model.glb');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.userData?.[MODEL_VARIANT_NAMES_KEY]).toEqual(['beach']);
      }
      expect(mesh.userData[VARIANT_MATERIALS_KEY]).toBeUndefined();

      releaseMaterial(new THREE.MeshStandardMaterial());
      await whenMaterialVariantsResolved(scene);
      expect(mesh.userData[VARIANT_MATERIALS_KEY]).toBeDefined();
    });
  });
});

describe('ModelLoaderFactory', () => {
  beforeEach(() => {
    resetGltfMock();
    resetDracoMock();
    resetKtx2Mock();
  });

  it('creates a GLTF loader for glb/gltf and forwards the decoder config', async () => {
    const loader = ModelLoaderFactory.createLoader('scene.glb', { dracoDecoderPath: '/d/' });
    await loader.load('scene.glb');

    expect(dracoInstances[0].setDecoderPath).toHaveBeenCalledWith('/d/');
  });

  it('throws UNSUPPORTED_FORMAT for other extensions', () => {
    expect(() => ModelLoaderFactory.createLoader('model.fbx')).toThrow(
      expect.objectContaining({ code: ErrorCode.UNSUPPORTED_FORMAT })
    );
  });
});

describe('ThreeGLTFLoaderAdapter BVH build', () => {
  beforeEach(() => {
    resetGltfMock();
    resetDracoMock();
    resetKtx2Mock();
  });

  const loadRealScene = async (config = {}) => {
    const adapter = new ThreeGLTFLoaderAdapter(config);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const scene = new THREE.Group();
    scene.add(mesh);
    // Feed a real THREE scene through the mocked loader.
    gltfInstances[0].load.mockImplementation(
      (_url: string, onLoad?: (gltf: { scene: THREE.Group; animations: unknown[] }) => void) => {
        onLoad?.({ scene, animations: [] });
      }
    );
    const result = await adapter.load('model.glb');
    return { result, mesh };
  };

  it('builds the raycast BVH by default', async () => {
    const { mesh } = await loadRealScene();
    expect((mesh.geometry as THREE.BufferGeometry & { boundsTree?: unknown }).boundsTree).toBeTruthy();
  });

  it('skips the BVH build when disabled', async () => {
    const { mesh } = await loadRealScene({ bvh: false });
    expect(
      (mesh.geometry as THREE.BufferGeometry & { boundsTree?: unknown }).boundsTree
    ).toBeUndefined();
  });
});
