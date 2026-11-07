export interface CaptureVideoOptions {
  /** Capture length in seconds. Default 3. */
  duration?: number;
  /** Frame rate handed to `canvas.captureStream()`. Default 30. */
  fps?: number;
  /**
   * Preferred container/codec (e.g. `'video/webm;codecs=vp9'`). When omitted
   * or unsupported the best supported WebM flavor is picked, falling back to
   * MP4 (Safari) and finally the browser default.
   */
  mimeType?: string;
  /** Encoder bitrate hint in bits per second. */
  videoBitsPerSecond?: number;
}
