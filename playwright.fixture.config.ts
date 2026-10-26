import { defineConfig, devices } from '@playwright/test';
// Test-only local HTTP fixtures: Playwright intercepts every Auth/Data/Edge request.
// These values are not credentials and never appear in a production build or .env file.
export default defineConfig({
  testDir: 'tests/browser-fixtures',
  outputDir: 'test-results/fixtures',
  fullyParallel: false,
  timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 5174',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-fixture-public-key',
    },
  },
  projects: [
    {
      name: 'connected-ui-fixtures',
      use: {
        ...devices['Desktop Chrome'],
        ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
      },
    },
  ],
});
