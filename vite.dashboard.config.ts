import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: 'dashboard-ui',
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./dashboard-ui/src', import.meta.url)),
    },
  },
  build: {
    outDir: '../public/dashboard',
    emptyOutDir: true,
  },
});
