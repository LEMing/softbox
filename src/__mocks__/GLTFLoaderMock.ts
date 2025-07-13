export class GLTFLoader {
  load = jest.fn((_url: string, onLoad?: (gltf: { scene: object }) => void) => {
    if (onLoad) {
      onLoad({ scene: {} });
    }
  });
  setDRACOLoader = jest.fn();
  setMeshoptDecoder = jest.fn();
}
