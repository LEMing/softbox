import { test, expect, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import {
  BACKDROP_BAND_COLOR,
  BACKDROP_BAND_LENGTH,
  BACKDROP_BASE_COLOR,
  BACKDROP_LONG_SIDE,
  BACKDROP_SHORT_SIDE,
  type BackdropOrientation,
} from './bandedBackdrop';

const HARNESS = '/render-smoke/index.html';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const decode = (buffer: Buffer): PNG => PNG.sync.read(buffer);

const pixelAt = (png: PNG, x: number, y: number): Rgb => {
  const i = (png.width * y + x) << 2;
  return { r: png.data[i], g: png.data[i + 1], b: png.data[i + 2] };
};

const luminance = ({ r, g, b }: Rgb): number =>
  (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

const colorDistance = (a: Rgb, b: Rgb): number =>
  Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);

const coverage = (png: PNG, background: Rgb): number => {
  let differing = 0;
  const total = png.width * png.height;
  for (let i = 0; i < total; i += 1) {
    const offset = i << 2;
    const pixel = {
      r: png.data[offset],
      g: png.data[offset + 1],
      b: png.data[offset + 2],
    };
    if (colorDistance(pixel, background) > 45) {
      differing += 1;
    }
  }
  return differing / total;
};

const diffFraction = (a: PNG, b: PNG, threshold: number): number => {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `screenshot sizes differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`
    );
  }
  let differing = 0;
  const total = a.width * a.height;
  for (let i = 0; i < total; i += 1) {
    const offset = i << 2;
    const pixelA = { r: a.data[offset], g: a.data[offset + 1], b: a.data[offset + 2] };
    const pixelB = { r: b.data[offset], g: b.data[offset + 1], b: b.data[offset + 2] };
    if (colorDistance(pixelA, pixelB) > threshold) {
      differing += 1;
    }
  }
  return differing / total;
};

const collectPageErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console.error: ${message.text()}`);
    }
  });
  return errors;
};

const waitForBoot = async (page: Page) => {
  await page.waitForFunction(
    () =>
      (window.__modelLoaded && window.__renderedFrames > 0) ||
      window.__pageErrors.length > 0,
    undefined,
    { timeout: 180_000 }
  );
  const pageErrors = await page.evaluate(() => window.__pageErrors);
  if (pageErrors.length > 0) {
    throw new Error(`harness page reported errors:\n${pageErrors.join('\n')}`);
  }
};

const openScene = async (page: Page, query = '') => {
  const errors = collectPageErrors(page);
  await page.goto(`${HARNESS}${query}`);
  await waitForBoot(page);
  return errors;
};

const screenshotCanvas = async (page: Page): Promise<PNG> => {
  const canvas = page.locator('canvas');
  return decode(await canvas.screenshot());
};

test('renders the model on the default look without page errors', async ({ page }) => {
  const errors = await openScene(page);
  const png = await screenshotCanvas(page);

  const background = pixelAt(png, 2, 2);
  expect(luminance(background)).toBeGreaterThan(0.55);
  const modelCoverage = coverage(png, background);
  expect(modelCoverage).toBeGreaterThan(0.02);
  expect(modelCoverage).toBeLessThan(0.9);

  expect(errors).toEqual([]);
});

test('dark preset paints a clearly darker background than the default look', async ({ page }) => {
  test.setTimeout(360_000);
  const errors = await openScene(page);
  const defaultBackground = luminance(pixelAt(await screenshotCanvas(page), 2, 2));

  await page.goto(`${HARNESS}?preset=dark`);
  await waitForBoot(page);
  const darkPng = await screenshotCanvas(page);
  const darkBackground = luminance(pixelAt(darkPng, 2, 2));

  expect(darkBackground).toBeLessThan(defaultBackground - 0.2);
  expect(darkBackground).toBeLessThan(0.55);
  expect(coverage(darkPng, pixelAt(darkPng, 2, 2))).toBeGreaterThan(0.02);

  expect(errors).toEqual([]);
});

test('studio_soft scene relights the model without touching the backdrop', async ({ page }) => {
  test.setTimeout(360_000);
  const errors = await openScene(page);
  const domePng = await screenshotCanvas(page);

  await page.goto(`${HARNESS}?scene=studio_soft`);
  await waitForBoot(page);
  const softPng = await screenshotCanvas(page);

  expect(colorDistance(pixelAt(softPng, 2, 2), pixelAt(domePng, 2, 2))).toBeLessThan(20);

  expect(diffFraction(domePng, softPng, 8)).toBeGreaterThan(0.01);

  expect(errors).toEqual([]);
});

test('switching the scene on a live viewer reloads the model (structural rebuild)', async ({ page }) => {
  test.setTimeout(360_000);
  const errors = await openScene(page);

  await page.evaluate(() => {
    window.__modelLoaded = false;
    window.__setScene('studio_soft');
  });
  await page.waitForFunction(
    () => window.__modelLoaded || window.__pageErrors.length > 0,
    undefined,
    { timeout: 180_000 }
  );
  await page.evaluate(() => {
    window.__renderedFrames = 0;
  });
  await waitForBoot(page);

  const png = await screenshotCanvas(page);
  const background = pixelAt(png, 2, 2);
  const modelCoverage = coverage(png, background);
  expect(modelCoverage).toBeGreaterThan(0.02);
  expect(modelCoverage).toBeLessThan(0.9);

  expect(errors).toEqual([]);
});

test('outdoor_concrete scene: the env image replaces the studio backdrop', async ({ page }) => {
  test.setTimeout(360_000);
  const errors = await openScene(page);
  const studioSky = pixelAt(await screenshotCanvas(page), 2, 2);

  await page.goto(`${HARNESS}?scene=outdoor_concrete&env=/render-smoke/sky.png`);
  await waitForBoot(page);
  const png = await screenshotCanvas(page);

  const outdoorSky = pixelAt(png, 2, 2);
  expect(colorDistance(outdoorSky, studioSky)).toBeGreaterThan(40);

  let orange = 0;
  const total = png.width * png.height;
  for (let i = 0; i < total; i += 1) {
    const offset = i << 2;
    if (
      png.data[offset] > png.data[offset + 1] + 40 &&
      png.data[offset] > png.data[offset + 2] + 40
    ) {
      orange += 1;
    }
  }
  expect(orange / total).toBeGreaterThan(0.005);

  expect(errors).toEqual([]);
});

const hexToRgb = (hex: string): Rgb => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

const BAND = hexToRgb(BACKDROP_BAND_COLOR);
const BASE = hexToRgb(BACKDROP_BASE_COLOR);
const BAND_SHARE_WHEN_STRETCHED = BACKDROP_BAND_LENGTH / BACKDROP_LONG_SIDE;
const EXACT_COLOR_TOLERANCE = 12;

const rowOf = (png: PNG, y: number): Rgb[] =>
  Array.from({ length: png.width }, (_, x) => pixelAt(png, x, y));

const columnOf = (png: PNG, x: number): Rgb[] =>
  Array.from({ length: png.height }, (_, y) => pixelAt(png, x, y));

const bandShare = (line: Rgb[]): number =>
  line.filter((pixel) => colorDistance(pixel, BAND) < 60).length / line.length;

const bandShareWhenCovering = (canvasAlongLongSide: number, canvasAlongShortSide: number): number => {
  const imagePixelsPerCanvasPixel = BACKDROP_SHORT_SIDE / canvasAlongShortSide;
  return BACKDROP_BAND_LENGTH / (canvasAlongLongSide * imagePixelsPerCanvasPixel);
};

const showBandedBackdrop = async (page: Page, orientation: BackdropOrientation) => {
  const framesBefore = await page.evaluate(() => window.__renderedFrames);
  await page.evaluate((value) => window.__setBandedBackdrop(value), orientation);
  await waitForFramesAfter(page, framesBefore);
};

const waitForFramesAfter = async (page: Page, framesBefore: number) => {
  await page.waitForFunction((count) => window.__renderedFrames > count + 1, framesBefore, {
    timeout: 60_000,
  });
};

const resizeViewer = async (page: Page, width: number, height: number) => {
  const framesBefore = await page.evaluate(() => window.__renderedFrames);
  await page.evaluate(
    ([cssWidth, cssHeight]) => {
      const root = document.getElementById('root')!;
      root.style.width = `${cssWidth}px`;
      root.style.height = `${cssHeight}px`;
    },
    [width, height]
  );
  await waitForFramesAfter(page, framesBefore);
};

test('a wide background image is cropped to the canvas, not squeezed, and keeps its sRGB colors', async ({ page }) => {
  const errors = await openScene(page);
  await showBandedBackdrop(page, 'wide');

  const landscape = await screenshotCanvas(page);
  const topRow = rowOf(landscape, 4);
  expect(bandShare(topRow)).toBeCloseTo(bandShareWhenCovering(landscape.width, landscape.height), 1);
  expect(bandShare(topRow)).toBeGreaterThan(BAND_SHARE_WHEN_STRETCHED * 2);
  expect(colorDistance(topRow[landscape.width >> 1], BAND)).toBeLessThanOrEqual(EXACT_COLOR_TOLERANCE);
  expect(colorDistance(topRow[2], BASE)).toBeLessThanOrEqual(EXACT_COLOR_TOLERANCE);

  await resizeViewer(page, 360, 480);
  const portrait = await screenshotCanvas(page);
  expect(portrait.height).toBeGreaterThan(portrait.width);
  expect(bandShare(rowOf(portrait, 4))).toBeCloseTo(bandShareWhenCovering(portrait.width, portrait.height), 1);

  expect(errors).toEqual([]);
});

test('a tall background image is cropped to the canvas, not stretched', async ({ page }) => {
  const errors = await openScene(page);
  await showBandedBackdrop(page, 'tall');

  const png = await screenshotCanvas(page);
  const leftColumn = columnOf(png, 4);
  expect(bandShare(leftColumn)).toBeCloseTo(bandShareWhenCovering(png.height, png.width), 1);
  expect(bandShare(leftColumn)).toBeGreaterThan(BAND_SHARE_WHEN_STRETCHED * 2);

  expect(errors).toEqual([]);
});

test('hotspot projects the origin anchor onto the model base', async ({ page }) => {
  const errors = await openScene(page, '?hotspot=1');

  const hotspot = page.getByTestId('viewer-hotspot');
  await expect(hotspot).toBeVisible();

  const canvasBox = await page.locator('canvas').boundingBox();
  const hotspotBox = await hotspot.boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(hotspotBox).not.toBeNull();

  const hotspotCenter = {
    x: hotspotBox!.x + hotspotBox!.width / 2,
    y: hotspotBox!.y + hotspotBox!.height / 2,
  };
  const canvasCenter = {
    x: canvasBox!.x + canvasBox!.width / 2,
    y: canvasBox!.y + canvasBox!.height / 2,
  };
  expect(Math.abs(hotspotCenter.x - canvasCenter.x)).toBeLessThan(25);
  expect(hotspotCenter.y).toBeGreaterThan(canvasCenter.y);
  expect(hotspotCenter.y).toBeLessThan(canvasBox!.y + canvasBox!.height);

  expect(errors).toEqual([]);
});

const patchLuminance = (png: PNG, x: number, y: number, halfSize = 3): number => {
  let sum = 0;
  let count = 0;
  for (let dy = -halfSize; dy <= halfSize; dy++) {
    for (let dx = -halfSize; dx <= halfSize; dx++) {
      const px = Math.min(Math.max(x + dx, 0), png.width - 1);
      const py = Math.min(Math.max(y + dy, 0), png.height - 1);
      sum += luminance(pixelAt(png, px, py));
      count += 1;
    }
  }
  return sum / count;
};

const patchChroma = (png: PNG, x: number, y: number, halfSize = 3): number => {
  let maxSpread = 0;
  for (let dy = -halfSize; dy <= halfSize; dy++) {
    for (let dx = -halfSize; dx <= halfSize; dx++) {
      const px = Math.min(Math.max(x + dx, 0), png.width - 1);
      const py = Math.min(Math.max(y + dy, 0), png.height - 1);
      const { r, g, b } = pixelAt(png, px, py);
      maxSpread = Math.max(maxSpread, Math.max(r, g, b) - Math.min(r, g, b));
    }
  }
  return maxSpread;
};

test('the baked contact shadow grounds the model: floor under the base is darker than open floor', async ({ page }) => {
  const errors = await openScene(page, '?hotspot=1');

  const canvasBox = await page.locator('canvas').boundingBox();
  const hotspotBox = await page.getByTestId('viewer-hotspot').boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(hotspotBox).not.toBeNull();

  const png = await screenshotCanvas(page);
  const scale = png.width / canvasBox!.width;
  const baseX = Math.round((hotspotBox!.x + hotspotBox!.width / 2 - canvasBox!.x) * scale);
  const baseY = Math.round((hotspotBox!.y + hotspotBox!.height / 2 - canvasBox!.y) * scale);

  const shadowY = Math.min(baseY + Math.round(png.height * 0.09), png.height - 4);
  const shadowLum = patchLuminance(png, baseX, shadowY);
  const sideOffset = Math.round(png.width * 0.28);
  const openLum = Math.max(
    patchLuminance(png, baseX - sideOffset, shadowY),
    patchLuminance(png, baseX + sideOffset, shadowY)
  );

  expect(patchChroma(png, baseX, shadowY)).toBeLessThan(60);

  expect(shadowLum).toBeLessThan(openLum - 0.06);
  expect(shadowLum).toBeGreaterThan(0.02);
  expect(openLum).toBeGreaterThan(0.3);

  expect(errors).toEqual([]);
});

test('a tall thin 20cm model keeps a contact shadow touching its base (small-object regression)', async ({ page }) => {
  const errors = await openScene(page, '?model=pillar&hotspot=1');

  const canvasBox = await page.locator('canvas').boundingBox();
  const hotspotBox = await page.getByTestId('viewer-hotspot').boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(hotspotBox).not.toBeNull();

  const png = await screenshotCanvas(page);
  const scale = png.width / canvasBox!.width;
  const baseX = Math.round((hotspotBox!.x + hotspotBox!.width / 2 - canvasBox!.x) * scale);
  const baseY = Math.round((hotspotBox!.y + hotspotBox!.height / 2 - canvasBox!.y) * scale);

  const shadowY = Math.min(baseY + Math.round(png.height * 0.07), png.height - 4);
  const shadowLum = patchLuminance(png, baseX, shadowY);
  const sideOffset = Math.round(png.width * 0.42);
  const openLum = Math.max(
    patchLuminance(png, baseX - sideOffset, shadowY),
    patchLuminance(png, baseX + sideOffset, shadowY)
  );

  expect(patchChroma(png, baseX, shadowY)).toBeLessThan(60);

  expect(shadowLum).toBeLessThan(openLum - 0.04);
  expect(shadowLum).toBeGreaterThan(0.02);
  expect(openLum).toBeGreaterThan(0.3);

  expect(errors).toEqual([]);
});

test('opt-in post-processing renders the model (no wash-out) and darkens the corners', async ({ page }) => {
  const errors = await openScene(page, '?effects=1');
  const png = await screenshotCanvas(page);

  let colored = 0;
  const total = png.width * png.height;
  for (let i = 0; i < total; i += 1) {
    const offset = i << 2;
    const r = png.data[offset];
    const g = png.data[offset + 1];
    const b = png.data[offset + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) {
      colored += 1;
    }
  }
  expect(colored / total).toBeGreaterThan(0.02);

  const cornerLum = patchLuminance(png, 6, 6);
  const topCenterLum = patchLuminance(png, Math.floor(png.width / 2), 6);
  expect(cornerLum).toBeLessThan(topCenterLum);

  expect(errors).toEqual([]);
});

test('path tracing accumulates real samples and shows the model (not black)', async ({ page }) => {
  const errors = await openScene(page, '?pathtracing=1');

  await page.waitForFunction(() => window.__ptSamples >= 12, undefined, {
    timeout: 180_000,
  });
  const png = await screenshotCanvas(page);

  let colored = 0;
  const total = png.width * png.height;
  for (let i = 0; i < total; i += 1) {
    const offset = i << 2;
    const r = png.data[offset];
    const g = png.data[offset + 1];
    const b = png.data[offset + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) {
      colored += 1;
    }
  }
  expect(colored / total).toBeGreaterThan(0.02);

  expect(errors).toEqual([]);
});

const changedFraction = (before: PNG, after: PNG): number => {
  let differing = 0;
  const total = before.width * before.height;
  for (let i = 0; i < total; i += 1) {
    const offset = i << 2;
    const delta =
      Math.abs(before.data[offset] - after.data[offset]) +
      Math.abs(before.data[offset + 1] - after.data[offset + 1]) +
      Math.abs(before.data[offset + 2] - after.data[offset + 2]);
    if (delta > 45) {
      differing += 1;
    }
  }
  return differing / total;
};

test('turntable keeps the scene moving: frames apart in time differ', async ({ page }) => {
  const errors = await openScene(page, '?turntable=1');

  const before = await screenshotCanvas(page);
  await page.waitForTimeout(1500);
  const after = await screenshotCanvas(page);

  expect(changedFraction(before, after)).toBeGreaterThan(0.005);

  expect(errors).toEqual([]);
});

test('animations prop plays the model clip: the model itself moves', async ({ page }) => {
  const errors = await openScene(page, '?animate=1');

  const before = await screenshotCanvas(page);
  await page.waitForTimeout(1000);
  const after = await screenshotCanvas(page);

  expect(changedFraction(before, after)).toBeGreaterThan(0.005);

  expect(errors).toEqual([]);
});

test('the poster dismisses itself after the first painted frame', async ({ page }) => {
  const errors = await openScene(page, '?poster=1');

  await expect(page.getByTestId('viewer-poster')).toHaveCount(0, { timeout: 10_000 });

  const screenshot = await screenshotCanvas(page);
  const center = pixelAt(screenshot, Math.floor(screenshot.width / 2), Math.floor(screenshot.height / 2));
  expect(colorDistance(center, { r: 255, g: 0, b: 255 })).toBeGreaterThan(45);

  expect(errors).toEqual([]);
});

test('captureStill returns a substantial PNG data URL', async ({ page }) => {
  const errors = await openScene(page);

  const dataUrl = await page.evaluate(() => window.__captureStill());
  expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  expect(dataUrl.length).toBeGreaterThan(10_000);

  expect(errors).toEqual([]);
});

test('captureVideo records the turntable into a real clip', async ({ page }) => {
  test.setTimeout(360_000);
  const errors = await openScene(page, '?turntable=1');

  let clip = { size: 0, type: '' };
  for (const duration of [3, 6, 12]) {
    clip = await page.evaluate((seconds) => window.__captureVideo(seconds), duration);
    if (clip.size > 3_000) {
      break;
    }
  }

  expect(clip.type).toContain('video/');
  expect(clip.size).toBeGreaterThan(3_000);

  expect(errors).toEqual([]);
});
