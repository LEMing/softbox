/**
 * Read the canvas as a PNG data URL, or null when the drawing buffer is empty
 * (a cleared WebGL buffer serializes to the literal `data:,`).
 */
export function canvasToPngDataUrl(canvas: HTMLCanvasElement): string | null {
  const dataUrl = canvas.toDataURL('image/png');
  if (!dataUrl || dataUrl === 'data:,') {
    return null;
  }
  return dataUrl;
}
