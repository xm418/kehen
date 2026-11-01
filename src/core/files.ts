import { Capacitor } from '@capacitor/core'
import type { DocumentMeta } from './types'

/**
 * 文档内容本体存放在 IndexedDB（元信息随 AppData 同步），
 * 登录云账号后同时上传一份到服务器，换机后可重新下载。
 */

export const MAX_FILE_SIZE = 10 * 1024 * 1024
export const ACCEPT_FILE_TYPES = '.doc,.docx,.pdf,.txt,.md,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png'

const DB_NAME = 'kedu-files'
const STORE = 'files'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        t.oncomplete = () => db.close()
      }),
  )
}

export function saveLocalBlob(id: string, blob: Blob): Promise<unknown> {
  return tx('readwrite', (s) => s.put(blob, id))
}

export function readLocalBlob(id: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>('readonly', (s) => s.get(id))
}

export function deleteLocalBlob(id: string): Promise<unknown> {
  return tx('readwrite', (s) => s.delete(id))
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || '')
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

/** 按文件扩展名猜 MIME，input 选择器拿到的 type 可能为空 */
export function guessMime(name: string, fallback: string): string {
  if (fallback) return fallback
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
  }
  return map[ext] ?? 'application/octet-stream'
}

/** 打开文档：原生端写缓存后交给系统查看器，网页端走下载 */
export async function openDocument(meta: DocumentMeta, blob: Blob): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const safeName = meta.name.replace(/[\\/:*?"<>|]/g, '_')
    const rel = `docs/${meta.id}-${safeName}`
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    await Filesystem.writeFile({
      path: rel,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
      recursive: true,
    })
    const { uri } = await Filesystem.getUri({ path: rel, directory: Directory.Cache })
    const { FileViewer } = await import('@capacitor/file-viewer')
    await FileViewer.openDocumentFromLocalPath({ path: uri })
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = meta.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
