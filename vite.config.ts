import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3100',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      onLog(level, log, defaultHandler) {
        // Suppress INVALID_ANNOTATION warnings from third-party deps
        if (log.code === 'INVALID_ANNOTATION') return
        defaultHandler(level, log)
      },
    },
  },
})
