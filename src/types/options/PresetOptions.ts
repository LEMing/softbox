/**
 * A one-word visual preset that configures lighting, environment, tone mapping
 * and background as a cohesive "look", so a model looks intentional on first
 * paint with zero manual tuning. Set it on `SimpleViewerOptions.preset` (or the
 * `preset` prop). Any explicit option you pass still overrides the preset.
 *
 * - `studio`   — clean, neutral light-grey backdrop; the balanced default look.
 * - `product`  — bright, high-key white backdrop for e-commerce hero shots.
 * - `neutral`  — flat, even, low-drama lighting for accurate inspection.
 * - `dark`     — dramatic dark backdrop for portfolios and glossy materials.
 * - `outdoor`  — brighter, daylight-leaning sky tint (procedural, no HDRI).
 * - `photoreal`— path-traced still: the highest-fidelity output for a hero image.
 */
export type ViewerPreset =
  | 'studio'
  | 'product'
  | 'neutral'
  | 'dark'
  | 'outdoor'
  | 'photoreal';
