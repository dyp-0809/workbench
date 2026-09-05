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
      '@personal-workbench/core': path.resolve(root, '../core/src/index.js'),
      '@personal-workbench/module-tasks': path.resolve(root, '../module-tasks/src/index.js'),
      '@personal-workbench/module-expiring': path.resolve(root, '../module-expiring/src/index.js'),
      '@personal-workbench/module-x': path.resolve(root, '../module-x/src/index.js'),
      '@personal-workbench/module-stock': path.resolve(root, '../module-stock/src/index.js'),
      '@personal-workbench/module-cycle': path.resolve(root, '../module-cycle/src/index.js'),
      '@personal-workbench/module-kindle': path.resolve(root, '../module-kindle/src/index.js')
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
