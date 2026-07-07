/** Perspective camera setup. World units are meters (see `units`). */
export interface CameraOptions {
  /** Starting camera position as `[x, y, z]`. */
  position?: [number, number, number];
  /** Point the camera looks at and the controls orbit around. */
  target?: [number, number, number];
  /** Vertical field of view in degrees. */
  fov?: number;
  /** Near clipping plane distance. */
  near?: number;
  /** Far clipping plane distance. */
  far?: number;
  /**
   * Frame the loaded model automatically (default `true`): the camera keeps
   * its configured direction but the distance is computed from the model's
   * bounds, so any model arrives sized to the view.
   */
  autoFitToObject?: boolean;
}
