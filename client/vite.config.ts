import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/signup': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
      '/sms': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
})
