export const gltfInstances: GLTFLoader[] = [];

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
