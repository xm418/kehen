import { useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../state/store'
import { useTodayKey } from '../hooks/useClock'
import { dueReviews } from '../core/stats'
import { formatShort, diffDays, weekdayLabel, minutesToText } from '../core/date'
import { StudyForm } from '../components/StudyForm'
import { Sheet } from '../components/Sheet'
import type { StudyLog } from '../core/types'

/** 把命中的关键词标出来，长笔记里才找得到那句话 */
function Highlight({ text, kw }: { text: string; kw: string }) {
  if (!kw) return <>{text}</>
  const lower = text.toLowerCase()
  const key = kw.toLowerCase()
  const parts: ReactNode[] = []
  let from = 0
  let idx = lower.indexOf(key, from)
  let n = 0
  while (idx >= 0) {
    if (idx > from) parts.push(text.slice(from, idx))
    parts.push(
      <mark className="hl" key={`h${n}`}>
        {text.slice(idx, idx + key.length)}
      </mark>,
    )
    from = idx + key.length
    n++
    idx = lower.indexOf(key, from)
  }
  if (from < text.length) parts.push(text.slice(from))
  return <>{parts}</>
}

export function NotesPage() {
  const { data, actions } = useStore()
  const today = useTodayKey()
  const [formOpen, setFormOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [subject, setSubject] = useState<string>('全部')
  const [tag, setTag] = useState<string>('')
  const [detail, setDetail] = useState<StudyLog | null>(null)
  const [editing, setEditing] = useState<StudyLog | null>(null)

  const due = dueReviews(data.studyLogs, today)
  const subjects = ['全部', ...Array.from(new Set(data.studyLogs.map((l) => l.subject)))]
  const tags = Array.from(new Set(data.studyLogs.flatMap((l) => l.tags)))

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return data.studyLogs.filter((l) => {
      if (subject !== '全部' && l.subject !== subject) return false
      if (tag && !l.tags.includes(tag)) return false
      if (!kw) return true
      return (
        l.title.toLowerCase().includes(kw) ||
        l.content.toLowerCase().includes(kw) ||
        l.tags.join(' ').toLowerCase().includes(kw)
      )
    })
  }, [data.studyLogs, keyword, subject, tag])

  const grouped = useMemo(() => {
    const map = new Map<string, StudyLog[]>()
    for (const l of filtered) {
      const arr = map.get(l.date) ?? []
      arr.push(l)
      map.set(l.date, arr)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  const detailLive = detail ? data.studyLogs.find((l) => l.id === detail.id) ?? null : null

  return (
    <>
      <div className="row-between" style={{ marginBottom: 16 }}>
        <div>
          <div className="eyebrow">记录</div>
          <h2 className="date-title" style={{ fontSize: 24, marginTop: 6 }}>
            每天学到的
          </h2>
          <div className="date-sub">
            共 {data.studyLogs.length} 条 · 累计 {minutesToText(data.studyLogs.reduce((a, l) => a + l.minutes, 0))}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
          ＋ 记录
        </button>
      </div>

      {due.length > 0 ? (
        <section className="card" style={{ marginBottom: 12 }}>
          <div className="card-head">
            <div>
              <h3 className="card-title">今天该复习了</h3>
              <div className="card-sub">按遗忘曲线排的，现在看一遍记得最牢</div>
            </div>
            <span className="pill active">{due.length}</span>
          </div>
          <div className="stack">
            {due.map((l) => (
              <div className="row-between" key={l.id} style={{ gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 550 }}>{l.title}</div>
                  <div className="log-meta">
                    <span>{l.subject}</span>
                    <span>{formatShort(l.date)}</span>
                    <span>
                      第 {l.reviewStage + 1} 次复习
                      {l.nextReviewAt && diffDays(today, l.nextReviewAt) > 0
                        ? ` · 逾期 ${diffDays(today, l.nextReviewAt)} 天`
                        : ''}
                    </span>
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => actions.reviewStudyLog(l.id)}>
                  已复习
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <input
          className="input"
          placeholder="搜索标题、内容、标签"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {subjects.slice(0, 8).map((s) => (
          <button key={s} className={`pill${subject === s ? ' active' : ''}`} onClick={() => setSubject(s)}>
            {s}
          </button>
        ))}
      </div>

      {tags.length > 0 ? (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <span className="eyebrow" style={{ alignSelf: 'center', marginRight: 2 }}>标签</span>
          {tags.slice(0, 12).map((t) => (
            <button
              key={t}
              className={`pill${tag === t ? ' active' : ''}`}
              onClick={() => setTag(tag === t ? '' : t)}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}

      {(keyword.trim() || tag || subject !== '全部') && !grouped.length ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="empty">没有匹配的记录，换个关键词或清掉筛选试试。</div>
        </div>
      ) : null}

      {grouped.length === 0 && !(keyword.trim() || tag || subject !== '全部') ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="empty">还没有记录。今天学到的一句话，也可以记下来。</div>
        </div>
      ) : (
        grouped.map(([date, items]) => (
          <div key={date}>
            <div className="day-label">
              <span className="eyebrow">
                {formatShort(date)} 周{weekdayLabel(date)}
              </span>
              <span className="line" />
              <span className="num muted" style={{ fontSize: 11 }}>
                {items.length}
              </span>
            </div>
            <div className="day-group">
              {items.map((l) => (
                <article className="log-card" key={l.id} onClick={() => setDetail(l)} style={{ cursor: 'pointer' }}>
                  <div className="row-between">
                    <span className="log-title">
                      <Highlight text={l.title} kw={keyword.trim()} />
                    </span>
                    <span className="num muted" style={{ fontSize: 11.5 }}>
                      {l.minutes} 分
                    </span>
                  </div>
                  <div className="log-meta">
                    <span>{l.subject}</span>
                    <span className="tag">
                      {l.nextReviewAt ? `复习第 ${l.reviewStage + 1} 轮` : '已复习完'}
                    </span>
                    {l.tags.map((t) => (
                      <span className="tag" key={t}>
                        {t}
                      </span>
                    ))}
                  </div>
                  {l.content ? (
                    <div className="log-content">
                      <Highlight text={l.content} kw={keyword.trim()} />
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        ))
      )}

      <StudyForm open={formOpen} onClose={() => setFormOpen(false)} />
      <StudyForm open={!!editing} log={editing ?? undefined} onClose={() => setEditing(null)} />

      <Sheet
        open={!!detailLive}
        onClose={() => setDetail(null)}
        title={detailLive?.title ?? ''}
        subtitle={
          detailLive
            ? `${detailLive.subject} · ${formatShort(detailLive.date)} · ${detailLive.minutes} 分钟`
            : undefined
        }
      >
        {detailLive ? (
          <div className="stack">
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.75, color: 'var(--text-2)' }}>
              {detailLive.content || '（没有写内容）'}
            </div>
            {detailLive.tags.length > 0 ? (
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {detailLive.tags.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <hr className="divider" />
            <div className="card-sub">
              {detailLive.nextReviewAt
                ? `已完成 ${detailLive.reviewStage} 次复习，下次复习：${formatShort(detailLive.nextReviewAt)}`
                : '这条内容已完成全部复习安排'}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn"
                onClick={() => {
                  setEditing(detailLive)
                  setDetail(null)
                }}
              >
                编辑
              </button>
              {detailLive.nextReviewAt ? (
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => actions.reviewStudyLog(detailLive.id)}
                >
                  标记已复习
                </button>
              ) : null}
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (confirm('删除这条学习记录？')) {
                    actions.deleteStudyLog(detailLive.id)
                    setDetail(null)
                  }
                }}
              >
                删除
              </button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  )
}
