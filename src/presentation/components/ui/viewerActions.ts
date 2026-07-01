/**
 * Derive a human-readable model name from the `object` prop: the decoded file
 * name for a URL, or the object's own name. Returns undefined when there is
 * nothing to show.
 */
export function deriveModelName(object: unknown): string | undefined {
  if (typeof object === 'string') {
    try {
      const path = new URL(object, 'http://x').pathname;
      const base = path.split('/').filter(Boolean).pop();
      return base ? decodeURIComponent(base) : object;
    } catch {
      const base = object.split(/[\\/]/).filter(Boolean).pop();
      return base || object;
    }
  }
  if (object && typeof object === 'object') {
    const named = object as { name?: unknown };
    if (typeof named.name === 'string' && named.name.length > 0) {
      return named.name;
    }
    return 'Model';
  }
  return undefined;
}

/** Capture the canvas as a PNG and trigger a download. */
export function downloadCanvasScreenshot(
  canvas: HTMLCanvasElement | null,
  filename = 'screenshot.png'
): void {
  if (!canvas) {
    return;
  }
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

/** Toggle native fullscreen for the given element. */
export function toggleFullscreen(element: HTMLElement | null): void {
  if (!element || typeof document === 'undefined') {
    return;
  }
  if (document.fullscreenElement) {
    void document.exitFullscreen?.();
  } else {
    void element.requestFullscreen?.();
  }
}

export function isFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenElement != null;
}
