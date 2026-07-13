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
 *   as-built, without the contrast push, for an even, low-drama wraparound
 *   light that flatters matte materials and softens speculars.
 */
export type ViewerScene = 'studio_dome' | 'studio_soft';
