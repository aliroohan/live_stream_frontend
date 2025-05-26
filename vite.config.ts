import { defineConfig } from 'vite';
import angular from '@angular/vite-plugin';

export default defineConfig({
  plugins: [angular()],
  server: {
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      }
    },
    fs: {
      strict: false
    },
    hmr: {
      protocol: 'ws',
      host: 'localhost'
    }
  },
  optimizeDeps: {
    exclude: ['@angular/core', '@angular/common', '@angular/platform-browser']
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['@angular/core', '@angular/common', '@angular/platform-browser']
        }
      }
    }
  }
}); 