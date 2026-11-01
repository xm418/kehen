import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 打包成单文件 HTML，桌面端可直接双击打开，手机端也可通过局域网浏览器访问
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
  preview: {
    host: true,
    port: 4173,
    proxy: { '/api': 'http://localhost:8787' },
  },
})
