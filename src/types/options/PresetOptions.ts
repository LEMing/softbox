/**
 * A one-word visual preset that sets the background, tone-mapping exposure and
 * environment intensity as a cohesive "look", so a model looks intentional on
 * first paint with zero manual tuning. Set it on `SimpleViewerOptions.preset`
 * (or the `preset` prop). Presets apply live, so switching one never rebuilds
 * the viewer or reloads the model. Any explicit option you pass overrides it.
 *
 * - `studio`  — clean, neutral light-grey backdrop; the balanced default look.
 * - `product` — bright, high-key white backdrop for e-commerce hero shots.
 * - `neutral` — flat, even, low-drama lighting for accurate inspection.
 * - `dark`    — dramatic dark backdrop for portfolios and glossy materials.
 * - `outdoor` — brighter, daylight-leaning sky tint.
 *
 * Path-traced output is a construction-time render mode (`pathTracing.enabled`),
 * not a live-switchable preset.
 */
export type ViewerPreset = 'studio' | 'product' | 'neutral' | 'dark' | 'outdoor';
