import * as THREE from 'three';
import { IGridStyle, IGridOptions } from './IGridStyle';

export class StoneTileGrid implements IGridStyle {
  name = 'Stone Tile Grid';
  private textureLoader = new THREE.TextureLoader();
  private loadedTextures: Map<string, THREE.Texture> = new Map();
  
  createGrid(options: IGridOptions): THREE.Object3D {
    const group = new THREE.Group();
    
    const size = options.size;
    const divisions = options.divisions;
    const tileSize = size / divisions;
    const gap = tileSize * 0.02; // 2% gap between tiles
    const actualTileSize = tileSize - gap;
    
    const height = options.styleOptions?.height || tileSize * 0.05;
    const bevelSize = options.styleOptions?.bevelSize || height * 0.2;
    const randomHeight = options.styleOptions?.randomHeight || false;
    const randomRotation = options.styleOptions?.randomRotation || false;
    
    // Create stone material
    const material = this.createStoneMaterial(options);
    
    // Create tiles in a grid pattern
    for (let i = 0; i < divisions; i++) {
      for (let j = 0; j < divisions; j++) {
        const x = (i - divisions / 2) * tileSize + tileSize / 2;
        const z = (j - divisions / 2) * tileSize + tileSize / 2;
        
        // Create tile geometry with beveled edges
        const tileHeight = randomHeight ? height * (0.8 + Math.random() * 0.4) : height;
        
        const shape = new THREE.Shape();
        const halfSize = actualTileSize / 2;
        shape.moveTo(-halfSize, -halfSize);
        shape.lineTo(halfSize, -halfSize);
        shape.lineTo(halfSize, halfSize);
        shape.lineTo(-halfSize, halfSize);
        shape.closePath();
        
        const extrudeSettings = {
          depth: tileHeight,
          bevelEnabled: true,
          bevelSize: bevelSize,
          bevelThickness: bevelSize,
          bevelSegments: 2,
        };
        
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.rotateX(-Math.PI / 2);
        
        const tile = new THREE.Mesh(geometry, material);
        tile.position.set(x, -tileHeight / 2, z);
        tile.castShadow = true;
        tile.receiveShadow = true;
        
        // Add random rotation if enabled
        if (randomRotation) {
          tile.rotation.y = Math.floor(Math.random() * 4) * (Math.PI / 2);
        }
        
        group.add(tile);
      }
    }
    
    return group;
  }
  
  private createStoneMaterial(options: IGridOptions): THREE.Material {
    const color = new THREE.Color(options.color || 0x808080);
    const metalness = options.styleOptions?.metalness || 0;
    const roughness = options.styleOptions?.roughness || 0.8;
    
    const materialOptions: THREE.MeshStandardMaterialParameters = {
      color: color,
      metalness: metalness,
      roughness: roughness,
    };
    
    // Load textures if provided
    if (options.styleOptions?.texture) {
      const texture = this.loadTexture(options.styleOptions.texture);
      if (texture) {
        materialOptions.map = texture;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
      }
    }
    
    if (options.styleOptions?.normalMap) {
      const normalMap = this.loadTexture(options.styleOptions.normalMap);
      if (normalMap) {
        materialOptions.normalMap = normalMap;
        normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
        normalMap.repeat.set(1, 1);
      }
    }
    
    if (options.styleOptions?.roughnessMap) {
      const roughnessMap = this.loadTexture(options.styleOptions.roughnessMap);
      if (roughnessMap) {
        materialOptions.roughnessMap = roughnessMap;
        roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
        roughnessMap.repeat.set(1, 1);
      }
    }
    
    return new THREE.MeshStandardMaterial(materialOptions);
  }
  
  private loadTexture(url: string): THREE.Texture | null {
    if (this.loadedTextures.has(url)) {
      return this.loadedTextures.get(url) || null;
    }
    
    try {
      const texture = this.textureLoader.load(url);
      this.loadedTextures.set(url, texture);
      return texture;
    } catch (error) {
      console.warn('Failed to load texture:', url, error);
      return null;
    }
  }
  
  dispose(): void {
    // Dispose of loaded textures
    this.loadedTextures.forEach(texture => {
      texture.dispose();
    });
    this.loadedTextures.clear();
  }
}