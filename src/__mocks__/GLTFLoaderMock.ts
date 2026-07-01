export const gltfInstances: GLTFLoader[] = [];

export class GLTFLoader {
  load = jest.fn((_url: string, onLoad?: (gltf: { scene: object; animations: unknown[] }) => void) => {
    if (onLoad) {
      onLoad({ scene: {}, animations: [] });
    }
  });
  setDRACOLoader = jest.fn();
  setKTX2Loader = jest.fn();
  setMeshoptDecoder = jest.fn();

  constructor() {
    gltfInstances.push(this);
  }
}

export const resetGltfMock = () => {
  gltfInstances.length = 0;
};
