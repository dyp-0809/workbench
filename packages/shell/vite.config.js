import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@x-assistant/core': path.resolve(root, '../core/src/index.js'),
      '@x-assistant/module-tasks': path.resolve(root, '../module-tasks/src/index.js'),
      '@x-assistant/module-expiring': path.resolve(root, '../module-expiring/src/index.js'),
      '@x-assistant/module-x': path.resolve(root, '../module-x/src/index.js')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': { target: 'http://127.0.0.1:4318', changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
