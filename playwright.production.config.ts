import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
const base = /src="([^"]*)assets\/index/.exec(readFileSync('dist/index.html', 'utf8'))?.[1] || '/';
if (!/^\/[a-zA-Z0-9/_-]*$/.test(base)) throw Error('Unsupported build base for local smoke test');
export default defineConfig({
  testDir: 'tests/production',
  outputDir: 'test-results/production',
  workers: 1,
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:5176' + base, trace: 'retain-on-failure' },
  webServer: {
    command: `npm run preview -- --port 5176 --base ${base}`,
    url: 'http://127.0.0.1:5176' + base,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'built-mobile',
      use: {
        ...devices['Pixel 7'],
        ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
      },
    },
  ],
});
