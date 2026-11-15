import { defineConfig } from '@playwright/test';
import fixture from './playwright.fixture.config';
import admin from './playwright.admin.config';
export default defineConfig({
  ...fixture,
  webServer: admin.webServer,
  workers: 1,
  use: { ...fixture.use, trace: 'off' },
  outputDir: 'test-results/admin-rebuild/full-fixtures',
});
