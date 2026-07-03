import { test, expect, Page } from '@playwright/test';
import { PNG } from 'pngjs';

/**
 * Pixel-level smoke of the real WebGL pipeline. These tests assert on ranges
 * (luminance, coverage fractions), never exact pixels, so they hold across
 * rasterizers (SwiftShader in CI, real GPUs locally).
 */

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

/** Fraction of pixels that clearly differ from the given background color. */
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

const openScene = async (page: Page, query = '') => {
  const errors = collectPageErrors(page);
  await page.goto(`${HARNESS}${query}`);
  // Also stop waiting the moment the page reports an error, so a broken
  // WebGL context fails with the reason instead of a mute timeout.
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
  // Defaults are the studio look: a light background...
  expect(luminance(background)).toBeGreaterThan(0.55);
  // ...with a real model on it: a torus knot covers a solid chunk of the
  // frame but never the whole frame.
  const modelCoverage = coverage(png, background);
  expect(modelCoverage).toBeGreaterThan(0.02);
  expect(modelCoverage).toBeLessThan(0.9);

  expect(errors).toEqual([]);
});

test('dark preset paints a clearly darker background than the default look', async ({ page }) => {
  const errors = await openScene(page);
  const defaultBackground = luminance(pixelAt(await screenshotCanvas(page), 2, 2));

  await page.goto(`${HARNESS}?preset=dark`);
  await page.waitForFunction(
    () => window.__modelLoaded && window.__renderedFrames > 0,
    undefined,
    { timeout: 180_000 }
  );
  const darkPng = await screenshotCanvas(page);
  const darkBackground = luminance(pixelAt(darkPng, 2, 2));

  // Absolute values shift with the tone-mapping pipeline; the studio↔dark
  // gap is what a broken preset switch would erase.
  expect(darkBackground).toBeLessThan(defaultBackground - 0.2);
  expect(darkBackground).toBeLessThan(0.55);
  expect(coverage(darkPng, pixelAt(darkPng, 2, 2))).toBeGreaterThan(0.02);

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

  // Floor alignment lifts the model so its base sits at y=0 while the camera
  // targets the model center: the origin anchor lands horizontally centered
  // in the lower half of the frame.
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

test('turntable keeps the scene moving: frames apart in time differ', async ({ page }) => {
  const errors = await openScene(page, '?turntable=1');

  const before = await screenshotCanvas(page);
  // Turntable speed 2 ≈ 12°/s; even SwiftShader accumulates a visible
  // rotation over a second of wall-clock.
  await page.waitForTimeout(1500);
  const after = await screenshotCanvas(page);

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
  // A frozen turntable yields ~0 differing pixels; a turning one repaints a
  // solid share of the model silhouette.
  expect(differing / total).toBeGreaterThan(0.005);

  expect(errors).toEqual([]);
});

test('captureStill returns a substantial PNG data URL', async ({ page }) => {
  const errors = await openScene(page);

  const dataUrl = await page.evaluate(() => window.__captureStill());
  expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  // A blank 480x360 PNG compresses to almost nothing; a real frame does not.
  expect(dataUrl.length).toBeGreaterThan(10_000);

  expect(errors).toEqual([]);
});
