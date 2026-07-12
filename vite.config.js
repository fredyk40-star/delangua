import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
  ],
  // Skip optimization for problematic packages
  optimizeDeps: {
    include: ['react', 'react-dom']
  },
  // Build configuration
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom']
        }
      }
    },
    chunkSizeWarningLimit: 2000,
    target: 'es2020',
    commonjsOptions: {
      transformMixedEsModules: true,
      include: [/node_modules/]
    }
  },
  // Worker configuration
  worker: {
    format: 'es',
    plugins: () => [react()]
  },
  // Server configuration
  server: {
    fs: {
      strict: false
    }
  },
  resolve: {
    alias: {}
  }
})