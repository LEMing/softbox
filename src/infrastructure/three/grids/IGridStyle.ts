import * as THREE from 'three';

export interface IGridStyle {
  name: string;
  
  createGrid(options: IGridOptions): THREE.Object3D;
  
  dispose?(): void;
}

export interface IGridOptions {
  size: number;
  divisions: number;
  color?: string | number;
  centerLineColor?: string | number;
  opacity?: number;
  
  styleOptions?: {
    hexRadius?: number;
    tileSize?: number;
    
    texture?: string;
    normalMap?: string;
    roughnessMap?: string;
    
    metalness?: number;
    roughness?: number;
    transmission?: number;
    thickness?: number;
    ior?: number;
    
    height?: number;
    bevelSize?: number;
    randomHeight?: boolean;
    randomRotation?: boolean;
  };
}

export enum GridType {
  SHADOW_FLOOR = 'shadow_floor',
  CONCRETE_DISC = 'concrete_disc',
  SQUARE_WIRE = 'square_wire',
  HEXAGONAL_WIRE = 'hexagonal_wire',
  HEXAGONAL_GLASS = 'hexagonal_glass',
  STONE_TILES = 'stone_tiles',
  CUSTOM = 'custom'
}