export const gltfInstances: GLTFLoader[] = [];

/** Tests set this to make the next load yield a specific gltf shape (e.g. a
 * variants-bearing model); cleared by resetGltfMock. */
let nextGltf: object | null = null;
export const setNextGltf = (gltf: object | null) => {
  nextGltf = gltf;
};

export class GLTFLoader {
  load = jest.fn(
    (
      _url: string,
      onLoad?: (gltf: { scene: object; animations: unknown[] }) => void,
      _onProgress?: (progress: unknown) => void,
      onError?: (error: unknown) => void
    ) => {
      // The real loader invokes onLoad inside a promise chain whose catch
      // routes a throwing callback to onError — mirror that, or tests of the
      // error path would reject the whole load() promise instead.
      try {
        onLoad?.(
          (nextGltf as { scene: object; animations: unknown[] } | null) ?? {
            scene: { traverse: () => undefined },
            animations: [],
          }
        );
      } catch (error) {
        onError?.(error);
      }
    }
  );
  setDRACOLoader = jest.fn();
  setKTX2Loader = jest.fn();
  setMeshoptDecoder = jest.fn();

  constructor() {
    gltfInstances.push(this);
  }
}

export const resetGltfMock = () => {
  gltfInstances.length = 0;
  nextGltf = null;
};
