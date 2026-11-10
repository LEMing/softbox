import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './render-smoke',
  timeout: 240_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 480, height: 360 },
    launchOptions: {
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
