import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      // Allow serving assets from npm package
      '@emotive-assets': path.resolve(__dirname, 'node_modules/@joshtol/emotive-engine/assets')
    }
  },
  // Serve npm package assets under /assets path
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
