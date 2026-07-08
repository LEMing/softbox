import * as THREE from 'three';

export interface IGridStyle {
  /**
   * Name of the grid style
   */
  name: string;
  
  /**
   * Create the grid geometry and materials
   */
  createGrid(options: IGridOptions): THREE.Object3D;
  
  /**
   * Dispose of any resources used by this grid style
   */
  dispose?(): void;
}

export interface IGridOptions {
  size: number;
  divisions: number;
  color?: string | number;
  centerLineColor?: string | number;
  opacity?: number;
  
  // Style-specific options
  styleOptions?: {
    // For hexagonal grids
    hexRadius?: number;
    tileSize?: number;
    
    // For textured grids
    texture?: string;
    normalMap?: string;
    roughnessMap?: string;
    
    // For glass/material properties
    metalness?: number;
    roughness?: number;
    transmission?: number;
    thickness?: number;
    ior?: number;
    
    // For stone/geometry grids
    height?: number;
    bevelSize?: number;
    randomHeight?: boolean;
    randomRotation?: boolean;
  };
}

export enum GridType {
  SHADOW_FLOOR = 'shadow_floor',
  SQUARE_WIRE = 'square_wire',
  HEXAGONAL_WIRE = 'hexagonal_wire',
  HEXAGONAL_GLASS = 'hexagonal_glass',
  STONE_TILES = 'stone_tiles',
  CUSTOM = 'custom'
}