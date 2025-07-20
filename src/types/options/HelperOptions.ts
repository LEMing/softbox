export interface GridHelperOptions {
  size?: number;
  divisions?: number;
  colorCenterLine?: string | number;
  colorGrid?: string | number;
  type?: 'square_wire' | 'hexagonal_wire' | 'hexagonal_glass' | 'stone_tiles';
  opacity?: number;
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

export interface AxesHelperOptions {
  size?: number;
}

export interface GizmoOptions {
  placement?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size?: number;
}

export interface HelperOptions {
  grid?: boolean | GridHelperOptions;
  axes?: boolean | AxesHelperOptions;
  stats?: boolean;
  gizmo?: boolean | GizmoOptions;
  studioEnvironment?: boolean;
}