export type BackdropOrientation = 'wide' | 'tall';

export const BACKDROP_LONG_SIDE = 800;
export const BACKDROP_SHORT_SIDE = 200;
export const BACKDROP_BAND_START = 350;
export const BACKDROP_BAND_LENGTH = 100;
export const BACKDROP_BASE_COLOR = '#1e3a8a';
export const BACKDROP_BAND_COLOR = '#f59e0b';
const BACKDROP_RING_CENTERS = [100, 400, 700];
const BACKDROP_RING_RADIUS = 70;

const orientedContext = (
  canvas: HTMLCanvasElement,
  orientation: BackdropOrientation
): CanvasRenderingContext2D => {
  if (orientation === 'tall') {
    canvas.width = BACKDROP_SHORT_SIDE;
    canvas.height = BACKDROP_LONG_SIDE;
    const context = canvas.getContext('2d')!;
    context.translate(BACKDROP_SHORT_SIDE, 0);
    context.rotate(Math.PI / 2);
    return context;
  }
  canvas.width = BACKDROP_LONG_SIDE;
  canvas.height = BACKDROP_SHORT_SIDE;
  return canvas.getContext('2d')!;
};

const paintWideBackdrop = (context: CanvasRenderingContext2D): void => {
  context.fillStyle = BACKDROP_BASE_COLOR;
  context.fillRect(0, 0, BACKDROP_LONG_SIDE, BACKDROP_SHORT_SIDE);
  context.fillStyle = BACKDROP_BAND_COLOR;
  context.fillRect(BACKDROP_BAND_START, 0, BACKDROP_BAND_LENGTH, BACKDROP_SHORT_SIDE);
  context.strokeStyle = '#ffffff';
  context.lineWidth = 12;
  for (const center of BACKDROP_RING_CENTERS) {
    context.beginPath();
    context.arc(center, BACKDROP_SHORT_SIDE / 2, BACKDROP_RING_RADIUS, 0, Math.PI * 2);
    context.stroke();
  }
};

export const bandedBackdrop = (orientation: BackdropOrientation): string => {
  const canvas = document.createElement('canvas');
  paintWideBackdrop(orientedContext(canvas, orientation));
  return canvas.toDataURL('image/png');
};
