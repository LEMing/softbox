/**
 * Configuration for the built-in loading overlay shown while a model loads.
 *
 * Pass a boolean on `SimpleViewerOptions.loadingIndicator` to toggle the
 * default overlay, or this object to customize it. Set `loadingIndicator: false`
 * to render your own using the `model:loading` / `model:loaded` / `model:error`
 * events on the viewer handle.
 */
export interface LoadingIndicatorOptions {
  /** Show the built-in overlay. Default: `true`. */
  enabled?: boolean;
  /** Text under the spinner while loading. Default: `'Loading…'`. */
  label?: string;
  /** Message shown if the model fails to load. Default: the error message. */
  errorLabel?: string;
  /** Spinner and text color. Default: `'#ffffff'`. */
  color?: string;
  /** Backdrop scrim behind the spinner. Default: a subtle dark scrim. */
  backdrop?: string;
}
