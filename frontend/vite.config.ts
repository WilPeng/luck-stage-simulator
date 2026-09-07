import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: 'https://luck-stage-simulator.onrender.com',
        changeOrigin: true,
        secure: true,
      },
      '/uploads': {
        target: 'https://luck-stage-simulator.onrender.com',
        changeOrigin: true,
        secure: true,
      },
      '/bigbrother-chat': {
        target: 'https://luck-stage-simulator.onrender.com',
        changeOrigin: true,
        ws: true,
        secure: true,
      },
    },
  },
})
