import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5176,
    proxy: {
      '/api': {
        target: 'http://localhost:5175',
        changeOrigin: true
      }
    }
  }
}) 