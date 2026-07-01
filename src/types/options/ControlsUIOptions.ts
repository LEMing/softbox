/**
 * The interaction the primary drag performs while that mode is active.
 * - `orbit`: drag rotates the camera around the target
 * - `pan`:   drag moves the camera parallel to the view plane
 * - `zoom`:  drag dollies in/out
 */
export type InteractionMode = 'orbit' | 'pan' | 'zoom';

/**
 * Configuration for the built-in viewer control overlay — a floating toolbar
 * (interaction modes, screenshot, fullscreen), a model-name badge, and a
 * settings button. Opt in with `SimpleViewerOptions.ui`.
 *
 * Pass `true` to enable everything with defaults, `false`/omitted to disable
 * (the default — no chrome is imposed on existing consumers), or this object to
 * pick which pieces show.
 */
export interface ControlsUIOptions {
  /** Master switch for the overlay. Default: `true` when a config object is given. */
  enabled?: boolean;
  /** Bottom floating toolbar. Default: `true`. */
  toolbar?: boolean;
  /** Orbit / Pan / Zoom interaction-mode toggle inside the toolbar. Default: `true`. */
  interactionModes?: boolean;
  /** Screenshot (download PNG) button. Default: `true`. */
  screenshot?: boolean;
  /** Fullscreen toggle button. Default: `true`. */
  fullscreen?: boolean;
  /** Top-left model-name badge. Default: `true`. */
  modelBadge?: boolean;
  /** Top-right settings button. Default: `true`. */
  settings?: boolean;
  /** Color theme for the chrome. Default: `'dark'`. */
  theme?: 'dark' | 'light';
}
