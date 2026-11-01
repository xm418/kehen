import { useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icons'
import { Sheet, Field } from '../components/Sheet'
import { useStore } from '../state/store'
import { KAOYAN_WORDS, parseWordLines, type WordSeed } from '../core/wordbank'
import { speakWord } from '../core/speech'
import { dictLookup } from '../core/storage/cloudAdapter'
import type { WordItem } from '../core/types'

export function WordsPage() {
  const { data, actions } = useStore()
  const words = data.words

  const familiarCount = words.filter((w) => w.familiar === 1).length

  // 待学队列：不认识的排前面，其次按加入顺序
  const queue = useMemo(
    () =>
      words
        .filter((w) => w.familiar === 0)
        .sort((a, b) => b.reviewCount - a.reviewCount || (a.addedAt < b.addedAt ? -1 : 1)),
    [words],
  )
  const [cursor, setCursor] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const current: WordItem | undefined = queue.length > 0 ? queue[cursor % queue.length] : undefined

  const nextCard = () => {
    setFlipped(false)
    setCursor((c) => (queue.length > 1 ? (c + 1) % queue.length : 0))
  }

  const markKnown = () => {
    if (!current) return
    actions.setWordFamiliar(current.id, 1)
    setFlipped(false)
    // 队列少了一个词，游标原地就是下一个
    setCursor((c) => c % Math.max(1, queue.length - 1))
  }

  const markUnknown = () => {
    if (!current) return
    actions.setWordFamiliar(current.id, 0)
    nextCard()
  }

  /* ------------------------------ 导入 ------------------------------ */
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const doImport = async (seeds: WordSeed[]) => {
    if (seeds.length === 0) {
      setProgress('没解析到单词，一行一个试试')
      return
    }
    setImporting(true)
    try {
      // 缺音标/释义的词，登录状态下尽量从词典补全（最多补 40 个，免得等太久）
      const { account, sync } = data.settings
      const need = seeds.filter((s) => !s.phonetic || !s.meaning)
      if (sync.mode === 'cloud' && account?.token && need.length > 0) {
        const limit = need.slice(0, 40)
        for (let i = 0; i < limit.length; i++) {
          setProgress(`正在补全音标 ${i + 1}/${limit.length}…`)
          const r = await dictLookup(sync.endpoint, account.token, limit[i].word)
          if (r) {
            if (!limit[i].phonetic && r.phonetic) limit[i].phonetic = r.phonetic
            if (!limit[i].meaning && r.meaning) limit[i].meaning = r.meaning
          }
        }
      }
      const added = actions.addWords(seeds)
      setProgress(`已导入 ${added} 个单词${added < seeds.length ? `（${seeds.length - added} 个重复跳过）` : ''}`)
      if (added > 0) {
        setImportText('')
        setTimeout(() => {
          setImportOpen(false)
          setProgress('')
        }, 900)
      }
    } finally {
      setImporting(false)
    }
  }

  const onPickFile = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    setImportText((prev) => (prev ? prev + '\n' + text : text))
  }

  const loadBuiltin = () => {
    const added = actions.addWords(KAOYAN_WORDS)
    setProgress(added > 0 ? `已载入 ${added} 个考研高频词` : '高频词都已经在词库里了')
    setTimeout(() => setProgress(''), 1800)
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-between">
        <div className="muted" style={{ fontSize: 13 }}>
          共 {words.length} 词 · 已熟 {familiarCount} · 待学 {queue.length}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-sm" onClick={() => setImportOpen(true)}>
            导入单词
          </button>
          <button className="btn btn-sm btn-ghost" onClick={loadBuiltin}>
            载入高频词
          </button>
        </div>
      </div>

      {progress && !importOpen ? <div className="muted" style={{ fontSize: 12.5 }}>{progress}</div> : null}

      {/* 学习卡片 */}
      {current ? (
        <div className="card word-card" onClick={() => setFlipped((f) => !f)}>
          <div className="word-stage">
            <div className="word-text">{current.word}</div>
            <div className="row" style={{ justifyContent: 'center', gap: 8, minHeight: 22 }}>
              {current.phonetic ? <span className="word-phonetic">{current.phonetic}</span> : null}
              <button
                className="icon-btn"
                aria-label="朗读单词"
                onClick={(e) => {
                  e.stopPropagation()
                  speakWord(current.word)
                }}
              >
                <Icon name="sound" size={18} />
              </button>
            </div>
            {flipped ? (
              <div className="word-meaning">{current.meaning || '（还没有释义，导入时可以补）'}</div>
            ) : (
              <div className="card-sub" style={{ marginTop: 8 }}>
                点卡片看释义
              </div>
            )}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 16 }}>
            <button
              className="btn btn-block"
              onClick={(e) => {
                e.stopPropagation()
                markUnknown()
              }}
            >
              不认识
            </button>
            <button
              className="btn btn-block btn-primary"
              onClick={(e) => {
                e.stopPropagation()
                markKnown()
              }}
            >
              认识
            </button>
          </div>
        </div>
      ) : (
        <div className="card flat empty">
          {words.length === 0 ? '词库还是空的，先导入单词或载入高频词' : '都认识了，明天再来'}
        </div>
      )}

      {/* 全部单词 */}
      {words.length > 0 ? (
        <div className="stack" style={{ gap: 8 }}>
          <div className="eyebrow">全部单词</div>
          {[...words]
            .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1))
            .map((w) => (
              <div key={w.id} className="log-card">
                <div className="row-between" style={{ alignItems: 'center' }}>
                  <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    <button className="icon-btn" aria-label={`朗读 ${w.word}`} onClick={() => speakWord(w.word)}>
                      <Icon name="sound" size={16} />
                    </button>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <span className="log-title" style={{ fontSize: 14 }}>{w.word}</span>
                        {w.phonetic ? <span className="word-phonetic">{w.phonetic}</span> : null}
                        {w.familiar === 1 ? <span className="tag">已熟</span> : null}
                      </div>
                      {w.meaning ? <div className="log-meta" style={{ marginTop: 2 }}>{w.meaning}</div> : null}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 4, flex: 'none' }}>
                    {w.familiar === 1 ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => actions.setWordFamiliar(w.id, 0)}>
                        重学
                      </button>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => actions.setWordFamiliar(w.id, 1)}>
                        标熟
                      </button>
                    )}
                    <button className="icon-btn" aria-label={`删除 ${w.word}`} onClick={() => actions.removeWord(w.id)}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      ) : null}

      {/* 导入 Sheet */}
      <Sheet
        open={importOpen}
        title="导入单词"
        subtitle="一行一个单词；可带音标和释义，如：abandon /əˈbændən/ v. 放弃"
        onClose={() => {
          if (!importing) setImportOpen(false)
        }}
      >
        <div className="stack">
          <Field label="粘贴单词文本">
            <textarea
              className="textarea"
              rows={7}
              placeholder={'abandon /əˈbændən/ v. 放弃\nability n. 能力\nstudy'}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
          </Field>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={importing}>
              从文件导入（txt / csv）
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,.md,text/plain,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                void onPickFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
          {progress ? <div className="muted" style={{ fontSize: 12.5 }}>{progress}</div> : null}
          <button
            className="btn btn-primary btn-block"
            disabled={importing || !importText.trim()}
            onClick={() => void doImport(parseWordLines(importText))}
          >
            {importing ? '正在导入…' : '开始导入'}
          </button>
        </div>
      </Sheet>
    </div>
  )
}
