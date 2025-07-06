export interface GridHelperOptions {
  size?: number;
  divisions?: number;
  colorCenterLine?: string | number;
  colorGrid?: string | number;
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