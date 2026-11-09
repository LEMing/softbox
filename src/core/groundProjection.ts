const GROUND_PROJECTION_HEIGHT_METERS = 2;
const GROUND_PROJECTION_RADIUS_METERS = 120;

const GROUND_PROJECTION_MIN_RADIUS_METERS = 75;

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
    radius: Math.max(
      positive(overrides.radius, GROUND_PROJECTION_RADIUS_METERS),
      GROUND_PROJECTION_MIN_RADIUS_METERS
    ),
  };
}
