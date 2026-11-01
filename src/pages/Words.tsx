import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icons'
import { Sheet, Field } from '../components/Sheet'
import { WordDetailSheet, WordEntries } from '../components/WordDetailSheet'
import { useStore } from '../state/store'
import { useTodayKey } from '../hooks/useClock'
import { KAOYAN_WORDS, parseWordLines, type WordSeed } from '../core/wordbank'
import { speakWord } from '../core/speech'
import { dictLookup } from '../core/storage/cloudAdapter'
import { loadWordDetail, readCachedDetail, type WordDetail } from '../core/wordDetail'
import type { WordItem } from '../core/types'

const AUTO_SPEAK_KEY = 'kedu:wordAutoSpeak'

function readAutoSpeak(): boolean {
  try {
    return localStorage.getItem(AUTO_SPEAK_KEY) !== '0'
  } catch {
    return true
  }
}

export function WordsPage() {
  const { data, actions } = useStore()
  const words = data.words
  const today = useTodayKey()
  const dailyGoal = data.settings.words.dailyGoal
  const studiedToday = data.wordProgress.date === today ? data.wordProgress.count : 0
  const goalLeft = Math.max(0, dailyGoal - studiedToday)

  // 分组列表（保持出现顺序）
  const groups = useMemo(() => {
    const seen: string[] = []
    for (const w of words) {
      const g = w.group ?? ''
      if (!seen.includes(g)) seen.push(g)
    }
    return seen
  }, [words])

  const [group, setGroup] = useState<string | null>(null) // null = 全部
  const scoped = useMemo(
    () => (group === null ? words : words.filter((w) => (w.group ?? '') === group)),
    [words, group],
  )

  const familiarCount = scoped.filter((w) => w.familiar === 1).length
  const progressPct = scoped.length > 0 ? Math.round((familiarCount / scoped.length) * 100) : 0

  // 待学队列：不认识的排前面，其次按加入顺序
  const queue = useMemo(
    () =>
      scoped
        .filter((w) => w.familiar === 0)
        .sort((a, b) => b.reviewCount - a.reviewCount || (a.addedAt < b.addedAt ? -1 : 1)),
    [scoped],
  )
  const [cursor, setCursor] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [autoSpeak, setAutoSpeak] = useState(readAutoSpeak)
  const current: WordItem | undefined = queue.length > 0 ? queue[cursor % queue.length] : undefined
  /** 卡片背面用的词条详情（词性/词义），翻面时才查 */
  const [currentDetail, setCurrentDetail] = useState<WordDetail | null>(null)

  // 卡片出现时自动发音（不背单词的体验）
  const currentId = current?.id
  useEffect(() => {
    if (currentId && autoSpeak && current) speakWord(current.word)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, autoSpeak])

  // 翻面后补全词条详情：先看本机缓存，没有就问服务器
  const currentWord = current?.word
  const endpoint = data.settings.sync.endpoint
  useEffect(() => {
    if (!flipped || !currentWord) {
      setCurrentDetail(null)
      return
    }
    const cached = readCachedDetail(currentWord)
    if (cached) {
      setCurrentDetail(cached)
      return
    }
    setCurrentDetail(null)
    let alive = true
    void loadWordDetail(endpoint, currentWord).then((d) => {
      if (alive) setCurrentDetail(d)
    })
    return () => {
      alive = false
    }
  }, [flipped, currentWord, endpoint])

  /* ---------------------------- 词条详情弹层 ---------------------------- */
  const [detailFor, setDetailFor] = useState<WordItem | null>(null)
  const [detailData, setDetailData] = useState<WordDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const detailWordRef = useRef('')

  const openDetail = (w: WordItem) => {
    detailWordRef.current = w.word
    setDetailFor(w)
    const cached = readCachedDetail(w.word)
    setDetailData(cached)
    setDetailLoading(!cached)
    if (cached) return
    void loadWordDetail(endpoint, w.word).then((d) => {
      if (detailWordRef.current !== w.word) return
      setDetailData(d)
      setDetailLoading(false)
    })
  }

  const closeDetail = () => {
    detailWordRef.current = ''
    setDetailFor(null)
  }

  const toggleAutoSpeak = () => {
    setAutoSpeak((v) => {
      const next = !v
      try {
        localStorage.setItem(AUTO_SPEAK_KEY, next ? '1' : '0')
      } catch {
        /* 忽略 */
      }
      return next
    })
  }

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
  const [importGroup, setImportGroup] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const doImport = async (seeds: WordSeed[]) => {
    if (seeds.length === 0) {
      setProgress('没解析到单词，一行一个试试')
      return
    }
    const g = importGroup.trim()
    if (g) for (const s of seeds) s.group = g
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
            if (!limit[i].example && r.example) limit[i].example = r.example
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
        <div style={{ minWidth: 0 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            共 {scoped.length} 词 · 已熟 {familiarCount} · 待学 {queue.length}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
            今日已学{' '}
            <span className="num" style={{ color: 'var(--text)' }}>
              {studiedToday}
            </span>{' '}
            / <span className="num">{dailyGoal}</span> 词{goalLeft > 0 ? ` · 还差 ${goalLeft} 词` : ' · 今日达标'}
          </div>
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

      {/* 分组筛选：一行横向滑动，分组再多也不会把卡片挤下去 */}
      {groups.length > 1 ? (
        <div className="pill-scroll">
          <button className={`pill${group === null ? ' active' : ''}`} onClick={() => setGroup(null)}>
            全部
          </button>
          {groups.map((g) => (
            <button
              key={g || '(empty)'}
              className={`pill${group === g ? ' active' : ''}`}
              onClick={() => {
                setGroup(g)
                setCursor(0)
                setFlipped(false)
              }}
            >
              {g || '未分组'}
            </button>
          ))}
        </div>
      ) : null}

      {/* 学习进度 */}
      {scoped.length > 0 ? (
        <div>
          <div className="row-between" style={{ fontSize: 12, marginBottom: 4 }}>
            <span className="muted">学习进度</span>
            <span className="num muted">{progressPct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--ink)' }} />
          </div>
        </div>
      ) : null}

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
              currentDetail ? (
                <>
                  <div style={{ textAlign: 'left', marginTop: 10 }}>
                    <WordEntries detail={currentDetail} compact />
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 10 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      openDetail(current)
                    }}
                  >
                    完整词条
                  </button>
                </>
              ) : (
                <div className="word-meaning">{current.meaning || '正在查词典…'}</div>
              )
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
          <div className="row-between" style={{ marginTop: 10 }}>
            <span className="muted" style={{ fontSize: 11.5 }}>
              {current.group ? `${current.group} · ` : ''}第 {queue.length === 0 ? 0 : (cursor % queue.length) + 1} / {queue.length} 词
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                e.stopPropagation()
                toggleAutoSpeak()
              }}
            >
              自动发音{autoSpeak ? '：开' : '：关'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card flat empty">
          {words.length === 0 ? '词库还是空的，先导入单词或载入高频词' : '都认识了，明天再来'}
        </div>
      )}

      {/* 全部单词 */}
      {scoped.length > 0 ? (
        <div className="stack" style={{ gap: 8 }}>
          <div className="eyebrow">全部单词</div>
          {[...scoped]
            .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1))
            .map((w) => (
              <div key={w.id} className="log-card">
                <div className="row-between" style={{ alignItems: 'center' }}>
                  <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    <button className="icon-btn" aria-label={`朗读 ${w.word}`} onClick={() => speakWord(w.word)}>
                      <Icon name="sound" size={16} />
                    </button>
                    <div
                      style={{ minWidth: 0, cursor: 'pointer' }}
                      onClick={() => openDetail(w)}
                      title="查看词条详情"
                    >
                      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <span className="log-title" style={{ fontSize: 14 }}>{w.word}</span>
                        {w.phonetic ? <span className="word-phonetic">{w.phonetic}</span> : null}
                        {w.familiar === 1 ? <span className="tag">已熟</span> : null}
                        {w.group ? <span className="tag">{w.group}</span> : null}
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

      {/* 词条详情 */}
      <WordDetailSheet
        open={!!detailFor}
        word={detailFor?.word ?? ''}
        phonetic={detailFor?.phonetic}
        detail={detailData}
        loading={detailLoading}
        fallbackMeaning={detailFor?.meaning}
        fallbackExample={detailFor?.example}
        onClose={closeDetail}
      />

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
          <Field label="分组（选填，如：必考词 U1）">
            <input
              className="input"
              value={importGroup}
              placeholder="留空表示未分组"
              onChange={(e) => setImportGroup(e.target.value)}
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
