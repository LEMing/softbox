import { defineConfig } from '@playwright/test';

/**
 * Render-smoke suite: drives the harness page (render-smoke/index.html) in
 * headless Chromium with software WebGL (SwiftShader) and asserts on actual
 * rendered pixels. Runs via `npm run test:render`; separate from jest on
 * purpose — jest stays fast and jsdom-only.
 */
export default defineConfig({
  testDir: './render-smoke',
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 800, height: 600 },
    launchOptions: {
      // Chromium >= 128 disables software WebGL unless explicitly allowed;
      // CI runners have no GPU.
      args: ['--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199/render-smoke/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
