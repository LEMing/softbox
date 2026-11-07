import * as THREE from 'three';

export class RGBELoader {
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

  setDataType(_type: number): RGBELoader {
    return this;
  }
}