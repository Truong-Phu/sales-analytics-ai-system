import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    proxy: {
      // Mọi request /api/* từ React → chuyển sang backend ASP.NET Core
      '/api': {
        target: 'http://localhost:5136',
        changeOrigin: true,
        secure: false,
      },
      // Static files: avatars và uploads (ảnh sản phẩm, ảnh user)
      '/avatars': {
        target: 'http://localhost:5136',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:5136',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
