import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { ACCEPT_FILE_TYPES, MAX_FILE_SIZE, formatSize, guessMime } from '../core/files'
import type { DocumentMeta } from '../core/types'

function mimeLabel(mime: string): string {
  if (mime.includes('word') || mime === 'application/msword') return 'Word'
  if (mime === 'application/pdf') return 'PDF'
  if (mime.includes('excel') || mime.includes('spreadsheet')) return 'Excel'
  if (mime.includes('powerpoint') || mime.includes('presentation')) return 'PPT'
  if (mime.startsWith('image/')) return '图片'
  if (mime.startsWith('text/')) return '文本'
  return '文件'
}

export function DocsPage() {
  const { data, actions } = useStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [opening, setOpening] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const docs = useMemo(
    () => [...data.documents].sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1)),
    [data.documents],
  )

  const cloudOn = data.settings.sync.mode === 'cloud' && !!data.settings.account?.token

  // 有账号但还没传上去的文档，进来时补传一份
  useEffect(() => {
    void actions.uploadPendingDocuments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onPick = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setError('')
    if (file.size > MAX_FILE_SIZE) {
      setError(`「${file.name}」超过 ${formatSize(MAX_FILE_SIZE)} 上限，存不下`)
      return
    }
    setBusy(true)
    try {
      await actions.addDocument({
        name: file.name,
        mime: guessMime(file.name, file.type),
        blob: file,
      })
    } catch {
      setError('保存失败，请再试一次')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const open = async (doc: DocumentMeta) => {
    setOpening(doc.id)
    setError('')
    try {
      await actions.openDocumentById(doc.id)
    } catch {
      setError(`「${doc.name}」打不开，可能本机没有这份文件，也没连上云`)
    } finally {
      setOpening(null)
    }
  }

  const remove = (doc: DocumentMeta) => {
    if (!confirm(`删除文档「${doc.name}」？学习记录里的引用也会一并摘掉。`)) return
    void actions.removeDocument(doc.id)
  }

  return (
    <>
      <div className="row-between" style={{ marginBottom: 16 }}>
        <div>
          <div className="eyebrow">文档</div>
          <h2 className="date-title" style={{ fontSize: 24, marginTop: 6 }}>
            学习资料
          </h2>
          <div className="date-sub">
            共 {docs.length} 份 · Word / PDF / 表格 / 图片
          </div>
        </div>
        <label className="btn btn-primary" style={{ cursor: busy ? 'default' : 'pointer' }}>
          {busy ? '上传中…' : '＋ 上传'}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_FILE_TYPES}
            hidden
            disabled={busy}
            onChange={(e) => void onPick(e.target.files)}
          />
        </label>
      </div>

      {!cloudOn ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="empty" style={{ padding: '14px 16px', textAlign: 'left' }}>
            现在文档只存在这台设备上。登录云账号后会自动备份一份，换手机也能下载。
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="empty" style={{ padding: '14px 16px', textAlign: 'left', color: 'var(--danger)' }}>
            {error}
          </div>
        </div>
      ) : null}

      {docs.length === 0 ? (
        <div className="card">
          <div className="empty">
            还没有文档。课件、真题、笔记的 PDF 和 Word，都可以放进来。
          </div>
        </div>
      ) : (
        <div className="day-group">
          {docs.map((d) => (
            <article className="log-card" key={d.id}>
              <div className="row-between">
                <span className="log-title" style={{ wordBreak: 'break-all' }}>
                  {d.name}
                </span>
                <span className="num muted" style={{ fontSize: 11.5, flexShrink: 0 }}>
                  {formatSize(d.size)}
                </span>
              </div>
              <div className="log-meta">
                <span className="tag">{mimeLabel(d.mime)}</span>
                <span>
                  {(() => {
                    const t = new Date(d.uploadedAt)
                    return `${t.getMonth() + 1}月${t.getDate()}日`
                  })()}
                </span>
                <span className="tag">{d.remoteId ? '已备份' : '仅本机'}</span>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button
                  className="btn btn-sm"
                  style={{ flex: 1 }}
                  disabled={opening === d.id}
                  onClick={() => void open(d)}
                >
                  {opening === d.id ? '打开中…' : '打开'}
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => remove(d)}>
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  )
}
