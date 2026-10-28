import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/mobile',
  outputDir: 'test-results/mobile',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: { baseURL: 'http://127.0.0.1:5175', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 5175',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_BASE_PATH: '/' },
  },
  projects: [
    {
      name: 'Android-Chromium',
      use: {
        ...devices['Pixel 7'],
        ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
      },
    },
    { name: 'iPhone-WebKit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
});
