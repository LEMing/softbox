import * as THREE from 'three';
import { IGridStyle, IGridOptions } from './IGridStyle';

export class SquareWireGrid implements IGridStyle {
  name = 'Square Wire Grid';
  
  createGrid(options: IGridOptions): THREE.Object3D {
    const size = options.size || 10;
    const divisions = options.divisions || 10;
    const color = new THREE.Color(options.color || 0x888888);
    const centerLineColor = new THREE.Color(options.centerLineColor || options.color || 0x444444);
    
    // Use Three.js built-in GridHelper
    const grid = new THREE.GridHelper(size, divisions, centerLineColor, color);
    
    // Adjust opacity if specified
    if (options.opacity !== undefined && options.opacity < 1) {
      const material = grid.material as THREE.LineBasicMaterial;
      material.transparent = true;
      material.opacity = options.opacity;
    }
    
    return grid;
  }
  
  dispose(): void {
    // GridHelper disposes itself
  }
}