import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE_PATH || '/',
  define: { global: 'globalThis' },
  test: {
    include: ['tests/{unit,integration}/**/*.test.ts'],
    environment: 'node',
    // Several suites boot a WASM PostgreSQL instance; bound concurrent startup and memory.
    maxWorkers: 2,
  },
  build: {
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          const path = id.replaceAll('\\', '/');
          if (
            path.includes('commonjsHelpers') ||
            /\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(path)
          )
            return 'react';
          if (/\/node_modules\/(@codemirror|@lezer|@uiw)\//.test(path)) return 'editor';
          if (path.includes('/node_modules/isomorphic-git/')) return 'git';
          if (path.includes('/node_modules/@supabase/')) return 'supabase';
        },
      },
    },
  },
});
