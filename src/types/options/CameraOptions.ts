export interface CameraOptions {
  position?: [number, number, number];
  target?: [number, number, number];
  fov?: number;
  near?: number;
  far?: number;
  autoFitToObject?: boolean;
}