import { defineConfig, devices } from '@playwright/test';
import fixture from './playwright.fixture.config';
export default defineConfig({
  testDir: fixture.testDir,
  webServer: fixture.webServer,
  use: fixture.use,
  timeout: fixture.timeout,
  fullyParallel: false,
  testMatch: 'management.spec.ts',
  grep: /mobile learning journey|session editor rejects/,
  workers: 1,
  outputDir: 'test-results/mobile-connected',
  projects: [
    {
      name: 'Android-connected',
      use: {
        ...devices['Pixel 7'],
        ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
      },
    },
    { name: 'iPhone-connected-WebKit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
});
