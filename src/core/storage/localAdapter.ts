import type { StorageAdapter } from './adapter'

const STORAGE_KEY = 'kedu:data:v1'

/** 浏览器本地存储实现 */
export function createLocalAdapter(): StorageAdapter {
  return {
    kind: 'local',
    async read() {
      try {
        return localStorage.getItem(STORAGE_KEY)
      } catch {
        return null
      }
    },
    async write(payload: string) {
      try {
        localStorage.setItem(STORAGE_KEY, payload)
      } catch (err) {
        // 容量超限时给出明确提示，避免静默丢数据
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
          alert('本地存储空间已满，请先导出备份并清理旧记录。')
        }
        throw err
      }
    },
    async clear() {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* ignore */
      }
    },
    subscribe(cb) {
      const handler = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY) cb(e.newValue)
      }
      window.addEventListener('storage', handler)
      return () => window.removeEventListener('storage', handler)
    },
  }
}

/** 导出为文件（备份、日历订阅等） */
export async function exportToFile(content: string, filename: string, type = 'application/json') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
