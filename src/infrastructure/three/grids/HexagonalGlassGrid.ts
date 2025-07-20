import * as THREE from 'three';
import { IGridStyle, IGridOptions } from './IGridStyle';
import HexTile from '../HexTile';
import { HexTileConfig } from '../HexTileConfig';

export class HexagonalGlassGrid implements IGridStyle {
  name = 'Hexagonal Glass Grid';
  
  createGrid(options: IGridOptions): THREE.Object3D {
    const group = new THREE.Group();
    
    const radius = options.styleOptions?.hexRadius || Math.floor(options.divisions / 2);
    const tileSize = options.styleOptions?.tileSize || 1;
    const color = String(options.color || '#ffffff');
    
    // Use centralized configuration for all calculations
    const gridSpacing = HexTileConfig.getGridSpacing(tileSize);
    const width = gridSpacing.width;
    const height = gridSpacing.height;
    
    for (let q = -radius; q <= radius; q++) {
      const r1 = Math.max(-radius, -q - radius);
      const r2 = Math.min(radius, -q + radius);
      
      for (let r = r1; r <= r2; r++) {
        const x = width * (q + r / 2);
        const z = height * 0.75 * r;
        const y = HexTileConfig.getYPosition(tileSize);
        
        const tile = new HexTile(new THREE.Vector3(x, y, z), tileSize, color);
        const mesh = tile.createMesh();
        group.add(mesh);
      }
    }
    
    return group;
  }
  
  dispose(): void {
    // Cleanup if needed
  }
}