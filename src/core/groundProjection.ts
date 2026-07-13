// GroundedSkybox defaults: a typical eye-level HDRI shot height, projected
// onto a set large enough that its "walls" sit far outside any orbit. The
// concrete disc caps its own radius below this (see ConcreteDiscGrid) so the
// ground never slices through the projected world.
const GROUND_PROJECTION_HEIGHT_METERS = 2;
const GROUND_PROJECTION_RADIUS_METERS = 120;

/**
 * Normalize the public `boolean | {height?, radius?}` shape to the concrete
 * projection the environment service applies, or undefined when off.
 * Non-positive overrides fall back to the defaults — GroundedSkybox throws on
 * them, which would silently cost the projection (the construction path
 * discards apply errors after a console.warn).
 */
export function resolveGroundProjection(
  groundProjection: boolean | { height?: number; radius?: number } | undefined
): { height: number; radius: number } | undefined {
  if (!groundProjection) {
    return undefined;
  }
  const overrides = typeof groundProjection === 'object' ? groundProjection : {};
  const positive = (value: number | undefined, fallback: number) =>
    value !== undefined && value > 0 ? value : fallback;
  return {
    height: positive(overrides.height, GROUND_PROJECTION_HEIGHT_METERS),
    radius: positive(overrides.radius, GROUND_PROJECTION_RADIUS_METERS),
  };
}
