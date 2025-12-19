import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Base path for GitHub Pages deployment (set VITE_BASE=/emotive-holo/ for GH Pages)
  base: process.env.VITE_BASE || '/',
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
    },
    // Dedupe Three.js to prevent multiple instances warning
    dedupe: ['three']
  },
  // Serve npm package assets under /assets path
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
