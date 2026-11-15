import { spawnSync } from 'node:child_process';
const options = new Set(process.argv.slice(2));
const env = {
  ...process.env,
  VITE_BASE_PATH: '/ieee-git-lab/',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'test-fixture-public-key',
  ...(process.platform === 'win32' ? { GIT_CONFIG_GLOBAL: 'NUL', GIT_CONFIG_NOSYSTEM: '1' } : {}),
  ...(options.has('--mobile') ? { ADMIN_UI_DEVICES: '1' } : {}),
  ...(options.has('--screenshots') ? { ADMIN_UI_CAPTURE: 'after' } : {}),
};
function run(args) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
// Fixtures stay in the ignored test-results directory; this never publishes or changes .env.
run([
  'node_modules/vite/bin/vite.js',
  'build',
  '--config',
  'vite.admin.config.ts',
  '--configLoader',
  'native',
  '--outDir',
  'test-results/admin-rebuild/site',
]);
run([
  'node_modules/playwright/cli.js',
  'test',
  '--config',
  'playwright.admin.config.ts',
  ...(options.has('--screenshots') ? ['--grep', 'admin dashboard design review captures'] : []),
]);
