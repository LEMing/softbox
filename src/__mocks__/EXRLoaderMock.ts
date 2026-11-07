import * as THREE from 'three';

export class EXRLoader {
  load(
    _url: string,
    onLoad?: (texture: THREE.Texture) => void,
    _onProgress?: (event: ProgressEvent) => void,
    _onError?: (error: Error | unknown) => void
  ): void {
    // Mock implementation
    if (onLoad) {
      const mockTexture = new THREE.Texture();
      onLoad(mockTexture);
    }
  }

  setDataType(_type: number): EXRLoader {
    return this;
  }
}