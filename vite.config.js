import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

function normalizeBasePath(path) {
  if (!path) return '/';
  let normalized = path.trim();
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  if (!normalized.endsWith('/')) normalized = `${normalized}/`;
  return normalized;
}

function resolveBasePath() {
  if (process.env.VITE_BASE_PATH) {
    return normalizeBasePath(process.env.VITE_BASE_PATH);
  }

  if (process.env.GITHUB_ACTIONS && process.env.GITHUB_REPOSITORY) {
    const repoName = process.env.GITHUB_REPOSITORY.split('/')[1];
    if (repoName) return `/${repoName}/`;
  }

  return '/';
}

export default defineConfig({
  base: resolveBasePath(),
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html')
      }
    }
  },
  server: {
    port: 5174,
    open: false,
    proxy: {
      '/api/feedback': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/api/describe': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/api/correct': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/api/health': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
});
