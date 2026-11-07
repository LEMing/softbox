/**
 * A one-word scene that selects the physical SET the model stands in — the
 * floor, the backdrop geometry and how the built-in studio environment is
 * built. Set it on `SimpleViewerOptions.scene`. The scene is the structural
 * counterpart of the tonal `preset` axis: presets grade the picture live,
 * scenes swap the set (switching one rebuilds the viewer). Any explicit
 * option you pass overrides the scene's values.
 *
 * - `studio_dome` — the default set: invisible shadow-catcher floor, baked
 *   soft contact shadow, crisp contrast-pushed studio environment (distinct
 *   highlights on glossy materials) and the path-traced infinity dome.
 * - `studio_soft` — the same set lit softly: the studio environment is used
 *   as-built, without the contrast push, plus a rebalanced rig (the key steps
 *   back, the rim edge nearly goes, the fill opens the shadows) for an even,
 *   low-drama read that flatters matte materials.
 * - `outdoor_concrete` — open air: a real daylight HDRI lights the model and
 *   paints the sky, standing on a large matte concrete ground disc. The HDRI
 *   is fetched from a CDN by default (the one network request this scene
 *   makes); pass your own `environment.url` to override or self-host it.
 */
export type ViewerScene = 'studio_dome' | 'studio_soft' | 'outdoor_concrete';
