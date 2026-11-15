import base from './vite.config.ts';
export default {
  ...base,
  cacheDir: 'test-results/admin-rebuild/vite-cache',
  build: {
    ...base.build,
    rollupOptions: {
      ...base.build?.rollupOptions,
      input: [
        'index.html',
        'tests/browser-fixtures/lab-harness.html',
        'tests/browser-fixtures/task1-harness.html',
        'tests/browser-fixtures/result-harness.html',
      ],
    },
  },
};
