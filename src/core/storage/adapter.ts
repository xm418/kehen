// 存储适配器抽象：本地存储与云端同步共用同一套接口，切换实现即可
export interface StorageAdapter {
  readonly kind: 'local' | 'cloud'
  read(): Promise<string | null>
  write(payload: string): Promise<void>
  clear(): Promise<void>
  /** 可选：监听外部变更（多标签页 / 云端推送） */
  subscribe?(cb: (payload: string | null) => void): () => void
}
