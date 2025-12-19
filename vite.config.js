import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Resolve the actual path to the emotive-engine 3d bundle using Node's resolution
let emotiveEngine3dPath;
try {
  // This will correctly resolve both local file: links and npm packages
  const pkgPath = require.resolve('@joshtol/emotive-engine/package.json');
  emotiveEngine3dPath = path.join(path.dirname(pkgPath), 'dist/emotive-mascot-3d.js');
} catch (e) {
  console.warn('Could not resolve @joshtol/emotive-engine, using fallback path');
  emotiveEngine3dPath = path.resolve(__dirname, 'node_modules/@joshtol/emotive-engine/dist/emotive-mascot-3d.js');
}

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
      '@emotive-assets': path.resolve(__dirname, 'node_modules/@joshtol/emotive-engine/assets'),
      // Resolve 3d subpath export using Node's resolution
      '@joshtol/emotive-engine/3d': emotiveEngine3dPath
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
