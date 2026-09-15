import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [react(), wasm()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  base: '/',
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false
      },
      '/install.sh': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false
      },
      '/share': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false
      }
    }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
