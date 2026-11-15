import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
const base =
  /src="([^"]*)assets\/index/.exec(readFileSync('dist-release/index.html', 'utf8'))?.[1] || '/';
export default defineConfig({
  testDir: 'tests/production',
  outputDir: 'test-results/admin-rebuild/production-browser',
  workers: 1,
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:5176' + base, trace: 'off' },
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js preview --configLoader native --outDir dist-release --host 127.0.0.1 --port 5176 --base ' +
      base,
    url: 'http://127.0.0.1:5176' + base,
    reuseExistingServer: true,
  },
  projects: [{ name: 'built-mobile', use: { ...devices['Pixel 7'], channel: 'msedge' } }],
});
