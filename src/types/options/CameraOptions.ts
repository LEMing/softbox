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
   * Frame the loaded model automatically (default `true`): the camera moves
   * to a standard product-shot view — left-front, slightly elevated — around
   * the model's center, at a distance computed from its bounds, and the
   * controls re-target the center. This OVERRIDES `position`/`target`;
   * disable it to keep your configured view exactly.
   */
  autoFitToObject?: boolean;
}
