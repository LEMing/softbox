import * as THREE from 'three';
import { IGridStyle, IGridOptions } from './IGridStyle';

export class HexagonalWireGrid implements IGridStyle {
  name = 'Hexagonal Wire Grid';
  
  createGrid(options: IGridOptions): THREE.Object3D {
    const group = new THREE.Group();
    
    // `??`, not `||`: hexRadius 0 is a real request for a single hex (the
    // dynamic grid sends it for very small objects), not an absent option.
    const radius = options.styleOptions?.hexRadius ?? Math.floor(options.divisions / 2);
    // radius can be 0 for a single-hex grid (small objects); guard the divisor so
    // tileSize never becomes Infinity/NaN and poisons the hex vertex positions
    // (which then surfaces as "computeBoundingSphere(): radius is NaN").
    const tileSize = options.size / Math.max(1, radius * 2);
    const color = new THREE.Color(options.color || 0x888888);
    const lineOpacity = options.opacity || 0.4;
    
    // Create line material
    const lineMaterial = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: lineOpacity,
    });
    
    // Generate hexagonal grid
    const width = tileSize * Math.sqrt(3);
    const height = tileSize * 2;
    
    for (let q = -radius; q <= radius; q++) {
      const r1 = Math.max(-radius, -q - radius);
      const r2 = Math.min(radius, -q + radius);
      
      for (let r = r1; r <= r2; r++) {
        const x = width * (q + r / 2);
        const z = height * 0.75 * r;
        
        // Create hexagon wireframe
        const hexPoints: THREE.Vector3[] = [];
        const angleStep = (Math.PI * 2) / 6;
        
        for (let i = 0; i <= 6; i++) {
          const angle = i * angleStep + Math.PI / 6;
          const hx = x + tileSize * Math.cos(angle);
          const hz = z + tileSize * Math.sin(angle);
          hexPoints.push(new THREE.Vector3(hx, 0, hz));
        }
        
        const hexGeometry = new THREE.BufferGeometry().setFromPoints(hexPoints);
        const hexLine = new THREE.Line(hexGeometry, lineMaterial);
        group.add(hexLine);
      }
    }
    
    return group;
  }
  
  dispose(): void {
    // Cleanup if needed
  }
}