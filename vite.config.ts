import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

/** 版本号只认 android/app/build.gradle 里的 versionName，界面和安装包永远一致 */
function readVersionName(): string {
  try {
    const gradle = readFileSync(fileURLToPath(new URL('./android/app/build.gradle', import.meta.url)), 'utf8')
    return /versionName\s+"([^"]+)"/.exec(gradle)?.[1] ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

// 打包成单文件 HTML，桌面端可直接双击打开，手机端也可通过局域网浏览器访问
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  define: {
    __APP_VERSION__: JSON.stringify(readVersionName()),
  },
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
