import { defineConfig } from '@playwright/test';

/**
 * Render-smoke suite: drives the harness page (render-smoke/index.html) in
 * headless Chromium with software WebGL (SwiftShader) and asserts on actual
 * rendered pixels. Runs via `npm run test:render`; separate from jest on
 * purpose — jest stays fast and jsdom-only.
 */
export default defineConfig({
  testDir: './render-smoke',
  // SwiftShader on a 2-core CI runner takes tens of seconds per first frame;
  // these timeouts are sized for that, not for local machines.
  timeout: 240_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 480, height: 360 },
    launchOptions: {
      // Chromium >= 128 disables software WebGL unless explicitly allowed;
      // CI runners have no GPU, so pin the ANGLE backend to SwiftShader.
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199/render-smoke/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
