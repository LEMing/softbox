import * as THREE from 'three';
import HexTile from './HexTile';
import { HexTileConfig } from './HexTileConfig';

class HexGrid {
  radius: number;
  tileSize: number;
  private readonly color: string;

  constructor(radius: number, tileSize: number, color: string) {
    this.radius = radius;
    this.tileSize = tileSize;
    this.color = color;
  }

  generateGrid(): HexTile[] {
    const hexTiles: HexTile[] = [];
    
    // Use centralized configuration for all calculations
    const gridSpacing = HexTileConfig.getGridSpacing(this.tileSize);
    const width = gridSpacing.width;
    const height = gridSpacing.height;

    for (let q = -this.radius; q <= this.radius; q++) {
      const r1 = Math.max(-this.radius, -q - this.radius);
      const r2 = Math.min(this.radius, -q + this.radius);
      for (let r = r1; r <= r2; r++) {
        const x = width * (q + r / 2);
        const z = height * 0.75 * r;
        const y = HexTileConfig.getYPosition(this.tileSize);
        const tile = new HexTile(new THREE.Vector3(x, y, z), this.tileSize, this.color);
        hexTiles.push(tile);
      }
    }

    return hexTiles;
  }

  addToScene(scene: THREE.Scene): void {
    const hexTiles = this.generateGrid();
    hexTiles.forEach(tile => {
      const mesh = tile.createMesh();
      scene.add(mesh);
    });
  }
}

export default HexGrid;
