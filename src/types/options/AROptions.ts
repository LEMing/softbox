/**
 * AR handoff configuration: a small button over the canvas that opens the
 * model in the platform's native AR viewer — AR Quick Look on iOS, Scene
 * Viewer on Android. UI-only: the button never touches the WebGL viewer, and
 * toggling it never rebuilds anything. The button only renders on devices
 * that can actually hand off (never on desktop).
 */
export interface AROptions {
  /**
   * USDZ counterpart of the model, for iOS AR Quick Look — Quick Look cannot
   * read GLB, so without this the button stays hidden on iOS. Android Scene
   * Viewer instead reuses the loaded model's own URL and needs nothing here
   * (but requires the model to be loaded from a network URL — a dropped
   * `blob:` file has no address a native app could fetch).
   */
  iosSrc?: string;

  /** Title shown on Android Scene Viewer's info card. */
  title?: string;
}
