/** Hermite smoothstep easing of a pre-clamped [0, 1] parameter. */
export const smoothstep01 = (t: number): number => t * t * (3 - 2 * t);
