import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icons'
import { Sheet, Field } from '../components/Sheet'
import { WordDetailSheet, WordEntries } from '../components/WordDetailSheet'
import { QuizSheet } from '../components/QuizSheet'
import { useStore } from '../state/store'
import { useTodayKey } from '../hooks/useClock'
import { KAOYAN_WORDS, parseWordLines, type WordSeed } from '../core/wordbank'
import { REVIEW_INTERVALS } from '../core/store-model'
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
  const dayProgress =
    data.wordProgress.date === today
      ? data.wordProgress
      : { date: today, count: 0, newCount: 0, reviewCount: 0 }
  const studiedToday = dayProgress.count
  const goalLeft = Math.max(0, dailyGoal - studiedToday)

  /** 今天该学的词：标熟的不算；排了复习日期的要到期才回来 */
  const isDue = (w: WordItem) => w.familiar === 0 && (!w.nextReviewAt || w.nextReviewAt <= today)

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
  const wrongCount = scoped.filter((w) => w.wrong).length
  const dueCount = scoped.filter(isDue).length
  const progressPct = scoped.length > 0 ? Math.round((familiarCount / scoped.length) * 100) : 0

  /* -------------------------- 搜索 / 状态筛选 / 排序 -------------------------- */
  type WordStatus = 'all' | 'due' | 'known' | 'wrong'
  const [status, setStatus] = useState<WordStatus>('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'added' | 'alpha' | 'review'>('added')
  const [listLimit, setListLimit] = useState(80)

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scoped.filter((w) => {
      if (status === 'due' && !isDue(w)) return false
      if (status === 'known' && w.familiar !== 1) return false
      if (status === 'wrong' && !w.wrong) return false
      if (!q) return true
      return w.word.includes(q) || (w.meaning ?? '').toLowerCase().includes(q)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, status, search, today])

  const listed = useMemo(() => {
    const arr = [...visible]
    if (sortBy === 'alpha') arr.sort((a, b) => a.word.localeCompare(b.word))
    else if (sortBy === 'review') arr.sort((a, b) => b.reviewCount - a.reviewCount || a.word.localeCompare(b.word))
    else arr.sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1))
    return arr
  }, [visible, sortBy])

  // 待学队列：到期的复习排前面，其次错过的词，最后是今天第一次见的新词
  const queue = useMemo(
    () =>
      scoped
        .filter(isDue)
        .sort((a, b) => {
          const ar = a.nextReviewAt && a.nextReviewAt <= today ? 0 : 1
          const br = b.nextReviewAt && b.nextReviewAt <= today ? 0 : 1
          if (ar !== br) return ar - br
          if (ar === 0 && a.nextReviewAt !== b.nextReviewAt) {
            return (a.nextReviewAt ?? '') < (b.nextReviewAt ?? '') ? -1 : 1
          }
          if (!!a.wrong !== !!b.wrong) return a.wrong ? -1 : 1
          return b.reviewCount - a.reviewCount || (a.addedAt < b.addedAt ? -1 : 1)
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, today],
  )

  /** 管理模式下勾选的词 */
  const [manage, setManage] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [quizOpen, setQuizOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
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

  const rate = (known: boolean) => {
    if (!current) return
    actions.rateWord(current.id, known)
    setFlipped(false)
    // 认识：这个词今天不再出现，队列变短后游标自然指向下一个；不认识：它还在队列里，先跳过去
    if (!known) nextCard()
  }

  /** 测验优先用还没掌握的词，不够再拿全部 */
  const quizPool = useMemo(() => {
    const pending = scoped.filter((w) => w.familiar === 0)
    return pending.length >= 4 ? pending : scoped
  }, [scoped])

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exitManage = () => {
    setManage(false)
    setSelected(new Set())
  }

  const batchKnown = () => {
    if (selected.size === 0) return
    actions.setWordsFamiliar([...selected], 1)
    exitManage()
  }

  const batchRemove = () => {
    if (selected.size === 0) return
    if (!window.confirm(`删除选中的 ${selected.size} 个单词？删掉后要重新导入才能回来`)) return
    actions.removeWords([...selected])
    exitManage()
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
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            共 {scoped.length} 词 · 已熟 {familiarCount} · 待学 {dueCount}
            {wrongCount > 0 ? ` · 错词 ${wrongCount}` : ''}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
            今日{' '}
            <span className="num" style={{ color: 'var(--text)' }}>
              {studiedToday}
            </span>{' '}
            / <span className="num">{dailyGoal}</span> 词 · 新词 {dayProgress.newCount} · 复习 {dayProgress.reviewCount}
            {goalLeft > 0 ? ` · 还差 ${goalLeft}` : ' · 今日达标'}
          </div>
        </div>
        <div className="row" style={{ gap: 6, flex: 'none' }}>
          <button className="btn btn-sm" onClick={() => setImportOpen(true)}>
            导入
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setQuizOpen(true)} disabled={quizPool.length === 0}>
            测验
          </button>
        </div>
      </div>

      {/* 今日目标进度 */}
      {scoped.length > 0 ? (
        <div>
          <div className="row-between" style={{ fontSize: 12, marginBottom: 4 }}>
            <span className="muted">
              今日目标 {studiedToday}/{dailyGoal}
            </span>
            <span className="num muted">掌握 {progressPct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${dailyGoal > 0 ? Math.min(100, Math.round((studiedToday / dailyGoal) * 100)) : 0}%`,
                background: 'var(--ink)',
              }}
            />
          </div>
        </div>
      ) : null}

      {/* 分组筛选：一行横向滑动，分组再多也不会把卡片挤下去 */}
      {groups.length > 1 || group !== null || groups.some((g) => g !== '') ? (
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
          {group !== null ? (
            <button
              className="pill"
              onClick={() => {
                setRenameDraft(group)
                setRenameOpen(true)
              }}
            >
              改组名
            </button>
          ) : null}
        </div>
      ) : null}

      {/* 搜索 / 筛选 / 排序 / 批量管理 */}
      {scoped.length > 0 ? (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input"
              style={{ flex: 1, minWidth: 0 }}
              placeholder="搜索单词或释义"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setListLimit(80)
              }}
            />
            <select
              className="input"
              style={{ width: 110, flex: 'none' }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            >
              <option value="added">按加入时间</option>
              <option value="alpha">按字母</option>
              <option value="review">错得最多</option>
            </select>
          </div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {(
              [
                ['all', `全部 ${scoped.length}`],
                ['due', `待学 ${dueCount}`],
                ['known', `已熟 ${familiarCount}`],
                ['wrong', `错词 ${wrongCount}`],
              ] as [WordStatus, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                className={`pill${status === v ? ' active' : ''}`}
                onClick={() => {
                  setStatus(v)
                  setListLimit(80)
                }}
              >
                {label}
              </button>
            ))}
            <button
              className={`pill${manage ? ' active' : ''}`}
              onClick={() => (manage ? exitManage() : setManage(true))}
            >
              {manage ? '退出管理' : '管理'}
            </button>
          </div>
        </div>
      ) : null}

      {manage ? (
        <div className="card flat" style={{ padding: 12 }}>
          <div className="row-between">
            <span className="muted" style={{ fontSize: 12.5 }}>
              已选 {selected.size} 个
            </span>
            <div className="row" style={{ gap: 6 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSelected(new Set(listed.slice(0, listLimit).map((w) => w.id)))}
              >
                全选本页
              </button>
              <button className="btn btn-sm" disabled={selected.size === 0} onClick={batchKnown}>
                标熟
              </button>
              <button className="btn btn-ghost btn-sm" disabled={selected.size === 0} onClick={batchRemove}>
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {progress && !importOpen ? <div className="muted" style={{ fontSize: 12.5 }}>{progress}</div> : null}

      {/* 学习卡片 */}
      {current ? (
        <div className="card word-card" onClick={() => setFlipped((f) => !f)}>
          <div className="word-stage">
            <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
              <span className="tag">
                {current.stage === 0 ? '新词' : `第 ${current.stage} 轮复习`}
              </span>
              {current.wrong ? <span className="tag">错过</span> : null}
            </div>
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
            {flipped && current.example ? <div className="word-example">{current.example}</div> : null}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 16 }}>
            <button
              className="btn btn-block"
              onClick={(e) => {
                e.stopPropagation()
                rate(false)
              }}
            >
              不认识
            </button>
            <button
              className="btn btn-block btn-primary"
              onClick={(e) => {
                e.stopPropagation()
                rate(true)
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
          <div className="muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 6 }}>
            {current.stage > 0 && current.stage < REVIEW_INTERVALS.length
              ? `答对后 ${REVIEW_INTERVALS[current.stage - 1]} 天再复习，还有 ${REVIEW_INTERVALS.length - current.stage} 轮掌握`
              : '答对后按 1/3/7/15/30/90 天递增复习'}
          </div>
        </div>
      ) : (
        <div className="card flat empty">
          {words.length === 0 ? (
            <>
              词库还是空的，先导入单词或{' '}
              <button className="btn btn-ghost btn-sm" onClick={loadBuiltin}>
                载入高频词
              </button>
            </>
          ) : scoped.length === 0 ? (
            '这个分组里还没有单词'
          ) : (
            '今天的词都学完了，明天继续复习'
          )}
        </div>
      )}

      {/* 词库列表 */}
      {scoped.length > 0 ? (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row-between">
            <span className="eyebrow">词库 · {listed.length} 个</span>
            <span className="muted" style={{ fontSize: 11.5 }}>
              点单词看完整词条
            </span>
          </div>
          {listed.length === 0 ? <div className="card flat empty">没有符合条件的单词</div> : null}
          {listed.slice(0, listLimit).map((w) => (
            <div key={w.id} className="log-card">
              <div className="row-between" style={{ alignItems: 'center' }}>
                <div className="row" style={{ gap: 8, minWidth: 0 }}>
                  {manage ? (
                    <button
                      className={`word-check${selected.has(w.id) ? ' on' : ''}`}
                      aria-label={selected.has(w.id) ? '取消选择' : '选择'}
                      onClick={() => toggleSelect(w.id)}
                    >
                      {selected.has(w.id) ? <Icon name="check" size={13} /> : null}
                    </button>
                  ) : (
                    <button className="icon-btn" aria-label={`朗读 ${w.word}`} onClick={() => speakWord(w.word)}>
                      <Icon name="sound" size={16} />
                    </button>
                  )}
                  <div
                    style={{ minWidth: 0, cursor: 'pointer' }}
                    onClick={() => openDetail(w)}
                    title="查看词条详情"
                  >
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <span className="log-title" style={{ fontSize: 14 }}>{w.word}</span>
                      {w.phonetic ? <span className="word-phonetic">{w.phonetic}</span> : null}
                      {w.familiar === 1 ? <span className="tag">已熟</span> : null}
                      {w.wrong ? <span className="tag">错词</span> : null}
                      {w.stage > 0 && w.familiar === 0 ? <span className="tag">第 {w.stage} 轮</span> : null}
                      {w.group ? <span className="tag">{w.group}</span> : null}
                    </div>
                    {w.meaning ? <div className="log-meta" style={{ marginTop: 2 }}>{w.meaning}</div> : null}
                  </div>
                </div>
                {manage ? null : (
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
                )}
              </div>
            </div>
          ))}
          {listed.length > listLimit ? (
            <button className="btn btn-ghost btn-block" onClick={() => setListLimit((n) => n + 120)}>
              再显示 {Math.min(120, listed.length - listLimit)} 个
            </button>
          ) : null}
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
        footer={
          detailFor ? (
            <div className="stack" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 8 }}>
                <button
                  className="btn btn-block"
                  onClick={() => {
                    actions.rateWord(detailFor.id, false)
                    closeDetail()
                  }}
                >
                  不认识
                </button>
                <button
                  className="btn btn-block btn-primary"
                  onClick={() => {
                    actions.rateWord(detailFor.id, true)
                    closeDetail()
                  }}
                >
                  认识
                </button>
              </div>
              {detailFor.wrong ? (
                <button
                  className="btn btn-ghost btn-block"
                  onClick={() => {
                    actions.setWordWrong(detailFor.id, false)
                    closeDetail()
                  }}
                >
                  移出错词本
                </button>
              ) : (
                <button
                  className="btn btn-ghost btn-block"
                  onClick={() => {
                    actions.setWordWrong(detailFor.id, true)
                    closeDetail()
                  }}
                >
                  加入错词本
                </button>
              )}
            </div>
          ) : null
        }
      />

      {/* 测验 */}
      <QuizSheet open={quizOpen} words={quizPool} onClose={() => setQuizOpen(false)} />

      {/* 改组名 */}
      <Sheet
        open={renameOpen}
        title="改组名"
        subtitle="只改当前分组里的单词，留空表示移到未分组"
        onClose={() => setRenameOpen(false)}
      >
        <div className="stack">
          <Field label="新组名">
            <input
              className="input"
              value={renameDraft}
              placeholder="留空表示未分组"
              onChange={(e) => setRenameDraft(e.target.value)}
            />
          </Field>
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              if (group !== null) {
                const to = renameDraft.trim()
                actions.renameWordGroup(group, to)
                setGroup(to || null)
              }
              setRenameOpen(false)
            }}
          >
            保存
          </button>
        </div>
      </Sheet>

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
