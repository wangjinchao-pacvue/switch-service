import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3456,
    proxy: {
      '/api': {
        target: 'http://localhost:3400',
        changeOrigin: true
      }
    }
  }
}) 