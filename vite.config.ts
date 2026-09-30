import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      exclude: ['maplibre-gl'],
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: [
          '**/data/**',
          '**/public/data/**',
          '**/dist/**',
          '**/*.zip',
          '**/*.sqlite*',
          '**/backend/**',
          '**/scripts/**',
          '**/template.yaml',
          '**/.system_generated/**',
          '**/.agents/**',
        ],
      },
      // Proxy /api/* to AWS API Gateway (or local backend if VITE_USE_LOCAL_API=true)
      proxy: {
        '/api': {
          target: process.env.VITE_USE_LOCAL_API === 'true'
            ? 'http://127.0.0.1:8000'
            : 'https://len52tbo7c.execute-api.ap-south-1.amazonaws.com/dev',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
