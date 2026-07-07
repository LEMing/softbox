export enum ControlType {
  MapControls = 'MapControls',
  OrbitControls = 'OrbitControls'
}

/** Mouse/touch camera controls (three.js OrbitControls semantics). */
export interface ControlsOptions {
  /**
   * `OrbitControls` (default) orbits around the model like a turntable;
   * `MapControls` pans on drag instead — the map/floor-plan idiom.
   */
  type?: ControlType;
  /** Master switch: `false` freezes all user camera input. */
  enabled?: boolean;
  /** Inertial easing after a drag ends, instead of an instant stop. */
  enableDamping?: boolean;
  /** Damping strength: lower = longer glide (three.js default 0.05). */
  dampingFactor?: number;
  /** Allow dolly/zoom (wheel, pinch). */
  enableZoom?: boolean;
  /** Allow orbiting (primary-button drag). */
  enableRotate?: boolean;
  /** Allow panning (secondary-button or two-finger drag). */
  enablePan?: boolean;
  /**
   * Turntable mode: the camera orbits the model on its own. Runtime-tunable
   * via `updateOptions`. While spinning, a path-traced `captureStill()`
   * rejects — the accumulation resets every frame and can never converge.
   */
  autoRotate?: boolean;
  /** Turntable speed: 2.0 ≈ one full orbit in 30 s at 60 fps. */
  autoRotateSpeed?: number;
  /** Closest dolly distance to the target. */
  minDistance?: number;
  /** Farthest dolly distance from the target. */
  maxDistance?: number;
  /** Lowest vertical orbit angle in radians (0 = looking straight down from above). */
  minPolarAngle?: number;
  /** Highest vertical orbit angle in radians (π = from below; π/2 stops at the horizon). */
  maxPolarAngle?: number;
}
