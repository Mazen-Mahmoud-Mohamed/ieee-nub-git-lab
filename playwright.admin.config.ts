import { defineConfig, devices } from '@playwright/test';
import fixture from './playwright.fixture.config';
const before = process.env.ADMIN_UI_CAPTURE === 'before';
export default defineConfig({
  ...fixture,
  outputDir: 'test-results/admin-rebuild/browser',
  use: { ...fixture.use, trace: 'off' },
  testMatch: 'management.spec.ts',
  workers: 1,
  webServer: {
    ...fixture.webServer,
    reuseExistingServer: !before,
    command: before
      ? 'node node_modules/vite/bin/vite.js test-results/admin-before --configLoader native --host 127.0.0.1 --port 5174'
      : 'node node_modules/vite/bin/vite.js preview --config vite.admin.config.ts --configLoader native --outDir test-results/admin-rebuild/site --host 127.0.0.1 --port 5174',
  },
  projects: [
    { name: 'Desktop', use: { ...devices['Desktop Chrome'], channel: 'msedge' } },
    ...(process.env.ADMIN_UI_DEVICES
      ? [
          { name: 'Android', use: { ...devices['Pixel 7'], channel: 'msedge' } },
          { name: 'iPhone', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
        ]
      : []),
  ],
});
