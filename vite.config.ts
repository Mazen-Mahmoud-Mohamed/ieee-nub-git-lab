import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE_PATH || '/',
  define: { global: 'globalThis' },
  test: { include: ['tests/{unit,integration}/**/*.test.ts'], environment: 'node' },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          editor: ['@uiw/react-codemirror', '@codemirror/theme-one-dark'],
          git: ['isomorphic-git'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
