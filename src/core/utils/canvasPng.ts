export function canvasToPngDataUrl(canvas: HTMLCanvasElement): string | null {
  const dataUrl = canvas.toDataURL('image/png');
  if (!dataUrl || dataUrl === 'data:,') {
    return null;
  }
  return dataUrl;
}
