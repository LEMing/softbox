export interface AnimationOptions {
  /**
   * Start playback when a model with clips loads: `true` plays ALL clips
   * (looped), a string plays the clip with that name.
   */
  autoplay?: boolean | string;
  /** Playback rate multiplier (1 = authored speed). Applied live. */
  speed?: number;
}
