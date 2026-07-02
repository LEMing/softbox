/**
 * Output size for `captureStill`, in pixels. When only one dimension is given
 * the other follows the canvas aspect ratio; when both are omitted the still
 * matches the canvas drawing buffer.
 */
export interface CaptureStillOptions {
  width?: number;
  height?: number;
}
