import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api':     'http://localhost:8787',
      '/sse':     { target: 'http://localhost:8787', changeOrigin: true },
      '/webhook': 'http://localhost:8787',
    },
  },
})