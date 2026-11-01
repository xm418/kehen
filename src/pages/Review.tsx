import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { useTodayKey } from '../hooks/useClock'
import { weekMetrics, monthMetrics, planByDay, planDoneForGoal } from '../core/stats'
import { addDays, formatShort, startOfWeek, relativeLabel, minutesToText, weekdayLabel } from '../core/date'
import { Ring, ScoreDots, SparkBars } from '../components/Charts'
import { Sheet, Field } from '../components/Sheet'
import type { Goal } from '../core/types'

function ratioOf(krs: Goal['krs']): number {
  if (krs.length === 0) return 0
  const sum = krs.reduce((a, k) => a + Math.min(1, k.target === 0 ? 0 : k.current / k.target), 0)
  return sum / krs.length
}

export function ReviewPage() {
  const { data, actions } = useStore()
  const today = useTodayKey()
  const [weekOffset, setWeekOffset] = useState(0)
  const [goalOpen, setGoalOpen] = useState(false)
  const [krTarget, setKrTarget] = useState<Goal | null>(null)
  const [planGoal, setPlanGoal] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const weekStart = addDays(startOfWeek(today), weekOffset * 7)
  const metrics = useMemo(() => weekMetrics(data, weekStart), [data, weekStart])
  const month = useMemo(() => monthMetrics(data, today), [data, today])
  const planTrend = useMemo(() => planByDay(data.plans, today, 14), [data.plans, today])
  const trendDays = planTrend.filter((d) => d.total > 0)
  const trendAvg = trendDays.length
    ? Math.round((trendDays.reduce((a, d) => a + d.rate, 0) / trendDays.length) * 100)
    : null
  const savedWeek = data.weeklyReviews.find((r) => r.weekStart === weekStart)
  // 历史复盘：周复盘 + 日复盘，新的在前
  const weekHistory = [...data.weeklyReviews].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))
  const dayHistory = [...data.dailyReviews].sort((a, b) => (a.date < b.date ? 1 : -1))
  const historyCount = weekHistory.length + dayHistory.length
  const shownWeeks = showHistory ? weekHistory : weekHistory.slice(0, 3)
  const shownDays = showHistory ? dayHistory : dayHistory.slice(0, 3)
  const [summary, setSummary] = useState(savedWeek?.summary ?? '')
  const [adjusted, setAdjusted] = useState(savedWeek?.adjusted ?? '')
  const [summaryWeek, setSummaryWeek] = useState(weekStart)

  if (summaryWeek !== weekStart) {
    setSummaryWeek(weekStart)
    setSummary(savedWeek?.summary ?? '')
    setAdjusted(savedWeek?.adjusted ?? '')
  }

  const daily = data.dailyReviews.find((r) => r.date === today) ?? {
    date: today,
    score: 0,
    wentWell: '',
    blocked: '',
    tomorrow: '',
  }
  const [dailyDraft, setDailyDraft] = useState(daily)
  const dailyKey = daily.wentWell + daily.blocked + daily.tomorrow + (data.dailyReviews.length ? '' : '0')
  const [draftKey, setDraftKey] = useState(dailyKey)
  if (draftKey !== dailyKey) {
    setDraftKey(dailyKey)
    setDailyDraft(daily)
  }

  // 目标表单
  const [gTitle, setGTitle] = useState('')
  const [gHorizon, setGHorizon] = useState<Goal['horizon']>('month')
  const [gDue, setGDue] = useState(addDays(today, 30))
  const [krTitle, setKrTitle] = useState('')
  const [krTargetValue, setKrTargetValue] = useState('')
  const [krUnit, setKrUnit] = useState('次')

  const activeGoals = data.goals.filter((g) => g.status === 'active')

  const submitGoal = () => {
    if (!gTitle.trim()) return
    actions.addGoal({ title: gTitle, horizon: gHorizon, dueDate: gDue })
    setGTitle('')
    setGoalOpen(false)
  }

  const submitKr = () => {
    if (!krTarget || !krTitle.trim()) return
    actions.addKeyResult(krTarget.id, krTitle.trim(), Number(krTargetValue) || 1, krUnit.trim() || '次')
    setKrTitle('')
    setKrTargetValue('')
    setKrTarget(null)
  }

  return (
    <>
      <section className="card" style={{ marginBottom: 12 }}>
        <div className="row-between" style={{ marginBottom: 14 }}>
          <div>
            <div className="eyebrow">周复盘</div>
            <h2 className="card-title" style={{ fontSize: 18, marginTop: 4 }}>
              {formatShort(weekStart)} — {formatShort(addDays(weekStart, 6))}
            </h2>
            <div className="card-sub">{weekOffset === 0 ? '本周进行中' : weekOffset < 0 ? '历史记录' : '未来周'}</div>
          </div>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset((v) => v - 1)}>
              ‹ 上一周
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset((v) => Math.min(0, v + 1))}>
              下一周 ›
            </button>
          </div>
        </div>

        <div className="metric-row four" style={{ marginBottom: 10 }}>
          <div className="metric">
            <div className="metric-value">{Math.round(metrics.habitRate * 100)}%</div>
            <div className="metric-label">习惯完成率</div>
          </div>
          <div className="metric">
            <div className="metric-value">{metrics.planTotal === 0 ? '—' : `${Math.round(metrics.planRate * 100)}%`}</div>
            <div className="metric-label">计划完成率</div>
          </div>
          <div className="metric">
            <div className="metric-value">{metrics.focusMinutes}</div>
            <div className="metric-label">专注分钟</div>
          </div>
          <div className="metric">
            <div className="metric-value">{metrics.studyCount}</div>
            <div className="metric-label">学习记录</div>
          </div>
        </div>
        <div className="card-sub" style={{ marginBottom: 16 }}>
          {metrics.planTotal === 0
            ? '本周还没写过每日计划'
            : `计划写了 ${metrics.planDays} 天，做完 ${metrics.planDone} / ${metrics.planTotal} 条`}
        </div>

        <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              每天自评
            </div>
            <ScoreDots scores={metrics.dailyScores.map((d) => d.score)} />
            <div className="card-sub" style={{ marginTop: 8 }}>
              {metrics.avgScore === null ? '本周还没有自评' : `平均 ${metrics.avgScore.toFixed(1)} 分`}
              {` · 复习 ${metrics.reviewCount} 次 · 累计 ${minutesToText(metrics.studyMinutes)}`}
            </div>
          </div>
          <Ring value={metrics.habitRate} size={58} stroke={3.5} />
        </div>

        <hr className="divider" />

        <div className="stack" style={{ gap: 6 }}>
          <div className="eyebrow">自动诊断</div>
          {metrics.notes.map((n) => (
            <div key={n} style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.65 }}>
              · {n}
            </div>
          ))}
        </div>

        <hr className="divider" />

        <div className="stack">
          <Field label="这周发生了什么">
            <textarea
              className="textarea"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="做得好的、没做到的、原因是什么"
            />
          </Field>
          <Field label="下周改一件事">
            <textarea
              className="textarea"
              value={adjusted}
              onChange={(e) => setAdjusted(e.target.value)}
              placeholder="只改一件，越具体越好"
              style={{ minHeight: 60 }}
            />
          </Field>
          <button
            className="btn btn-primary btn-block"
            onClick={() => actions.saveWeeklyReview(weekStart, summary, adjusted)}
          >
            {savedWeek ? '更新本周复盘' : '保存本周复盘'}
          </button>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">本月成绩单</h3>
            <div className="card-sub">
              {formatShort(month.monthStart)} 至今 · 只看本月的数字
            </div>
          </div>
          <Ring value={month.habitRate} size={54} stroke={3.5}>
            <span style={{ fontSize: 11 }}>{Math.round(month.habitRate * 100)}%</span>
          </Ring>
        </div>

        <div className="metric-row">
          <div className="metric">
            <div className="metric-value">{month.habitDone}</div>
            <div className="metric-label">本月完成次数</div>
          </div>
          <div className="metric">
            <div className="metric-value">{month.bestCurrent}</div>
            <div className="metric-label">当前连续天数</div>
          </div>
          <div className="metric">
            <div className="metric-value">{month.bestLongest}</div>
            <div className="metric-label">最长纪录</div>
          </div>
        </div>

        <div className="metric-row four" style={{ marginTop: 12 }}>
          <div className="metric">
            <div className="metric-value">{month.focusMinutes}</div>
            <div className="metric-label">专注分钟</div>
          </div>
          <div className="metric">
            <div className="metric-value">{month.studyCount}</div>
            <div className="metric-label">学习记录</div>
          </div>
          <div className="metric">
            <div className="metric-value">
              {month.planTotal === 0 ? '—' : `${Math.round(month.planRate * 100)}%`}
            </div>
            <div className="metric-label">计划完成率</div>
          </div>
          <div className="metric">
            <div className="metric-value">{month.backfillCount}</div>
            <div className="metric-label">事后补录</div>
          </div>
        </div>

        <div className="card-sub" style={{ marginTop: 10 }}>
          {month.bestName && month.bestCurrent > 0
            ? `目前最稳的是「${month.bestName}」，连续 ${month.bestCurrent} 天。`
            : '还没有形成连续记录，今天先做一件最小的事。'}
          {month.backfillCount > 0 ? ' 补录的打卡不计入连续天数。' : ''}
        </div>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">每日计划完成情况</h3>
            <div className="card-sub">最近 14 天 · 那天没写计划就不计入平均</div>
          </div>
          <span className="num muted" style={{ fontSize: 12 }}>
            {trendAvg === null ? '暂无' : `平均 ${trendAvg}%`}
          </span>
        </div>
        <SparkBars
          items={planTrend.map((d) => ({
            key: d.key,
            value: Math.round(d.rate * 100),
            label: weekdayLabel(d.key),
          }))}
          height={62}
        />
        <div className="card-sub" style={{ marginTop: 8 }}>
          {trendDays.length === 0 ? '还没有写过计划，今晚花一分钟给明天写一条。' : `已写 ${trendDays.length} 天，写完不是目的，勾掉才算。`}
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">今天复盘</h3>
              <div className="card-sub">{formatShort(today)} · {relativeLabel(today)}</div>
            </div>
          </div>
          <div className="row" style={{ gap: 6, marginBottom: 12 }}>
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                className={`pill${dailyDraft.score === s ? ' active' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setDailyDraft({ ...dailyDraft, score: s })}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="stack">
            <Field label="做到了什么">
              <textarea
                className="textarea"
                style={{ minHeight: 56 }}
                value={dailyDraft.wentWell}
                onChange={(e) => setDailyDraft({ ...dailyDraft, wentWell: e.target.value })}
              />
            </Field>
            <Field label="卡在哪">
              <textarea
                className="textarea"
                style={{ minHeight: 56 }}
                value={dailyDraft.blocked}
                onChange={(e) => setDailyDraft({ ...dailyDraft, blocked: e.target.value })}
              />
            </Field>
            <Field label="明天第一件事">
              <input
                className="input"
                value={dailyDraft.tomorrow}
                onChange={(e) => setDailyDraft({ ...dailyDraft, tomorrow: e.target.value })}
              />
            </Field>
            <button className="btn btn-block" onClick={() => actions.saveDailyReview(dailyDraft)}>
              保存今日复盘
            </button>
          </div>
        </section>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title">目标</h3>
                <div className="card-sub">拆成可量化的指标，才知道有没有进展</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setGoalOpen(true)}>
                ＋ 新目标
              </button>
            </div>

            {activeGoals.length === 0 ? (
              <div className="empty">还没有目标。先定一个这个月想完成的事。</div>
            ) : (
              <div className="stack">
                {activeGoals.map((g) => {
                  const ratio = ratioOf(g.krs)
                  const promoted = planDoneForGoal(data.plans, g.id, weekStart, addDays(weekStart, 6))
                  return (
                    <div className="goal-card" key={g.id}>
                      <div className="row-between" style={{ alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="goal-title">{g.title}</div>
                          <div className="card-sub">
                            {g.horizon === 'week' ? '周目标' : g.horizon === 'month' ? '月目标' : '季度目标'} ·{' '}
                            {relativeLabel(g.dueDate)}
                            {promoted > 0 ? ` · 本周计划推进 ${promoted} 次` : ''}
                          </div>
                        </div>
                        <div className="num muted" style={{ fontSize: 12 }}>
                          {Math.round(ratio * 100)}%
                        </div>
                      </div>
                      <div className="prog" style={{ marginTop: 10 }}>
                        <div className="prog-fill" style={{ width: `${ratio * 100}%` }} />
                      </div>

                      {g.krs.map((kr) => (
                        <div className="kr-row" key={kr.id}>
                          <span className="kr-title">{kr.title}</span>
                          <button
                            className="icon-btn"
                            style={{ width: 22, height: 22 }}
                            onClick={() =>
                              actions.updateKeyResult(g.id, kr.id, { current: Math.max(0, kr.current - 1) })
                            }
                          >
                            −
                          </button>
                          <span className="kr-value">
                            {kr.current}/{kr.target}
                            {kr.unit}
                          </span>
                          <button
                            className="icon-btn"
                            style={{ width: 22, height: 22 }}
                            onClick={() => actions.updateKeyResult(g.id, kr.id, { current: kr.current + 1 })}
                          >
                            ＋
                          </button>
                          <button
                            className="icon-btn"
                            style={{ width: 22, height: 22 }}
                            aria-label="删除指标"
                            onClick={() => {
                              if (confirm(`删除指标「${kr.title}」？`)) actions.removeKeyResult(g.id, kr.id)
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      <div className="row" style={{ gap: 6, marginTop: 10 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setKrTarget(g)}>
                          ＋ 指标
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            actions.addPlanItem(addDays(today, 1), `推进：${g.title}`, false, g.id)
                            setPlanGoal(g.id)
                          }}
                        >
                          {planGoal === g.id ? '已加进明天' : '写进明天计划'}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => actions.updateGoal(g.id, { status: 'done' })}
                        >
                          完成
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ marginLeft: 'auto' }}
                          onClick={() => {
                            if (confirm(`删除目标「${g.title}」？`)) actions.removeGoal(g.id)
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title">复盘历史</h3>
                <div className="card-sub">过去写下的周复盘和日复盘，都留在这里</div>
              </div>
              {historyCount > 6 ? (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowHistory((v) => !v)}>
                  {showHistory ? '收起' : '展开全部'}
                </button>
              ) : null}
            </div>

            {historyCount === 0 ? (
              <div className="empty">还没有历史复盘。写完这周小结，它就会出现在这里。</div>
            ) : (
              <div className="stack" style={{ gap: 12, marginTop: 8 }}>
                {shownWeeks.map((r) => (
                  <div key={r.weekStart}>
                    <div className="eyebrow">{formatShort(r.weekStart)} 那周</div>
                    <div className="card-sub" style={{ whiteSpace: 'pre-wrap', color: 'var(--text-2)', lineHeight: 1.8 }}>
                      {r.summary || '（没写总结）'}
                    </div>
                    {r.adjusted ? (
                      <div className="card-sub" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
                        调整：{r.adjusted}
                      </div>
                    ) : null}
                  </div>
                ))}
                {shownDays.map((r) => (
                  <div key={r.date}>
                    <div className="eyebrow">
                      {formatShort(r.date)} · {r.score ? `${r.score} 分` : '没打分'}
                    </div>
                    <div className="card-sub" style={{ whiteSpace: 'pre-wrap', color: 'var(--text-2)', lineHeight: 1.8 }}>
                      {r.wentWell || r.blocked || r.tomorrow || '（没写内容）'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <Sheet open={goalOpen} onClose={() => setGoalOpen(false)} title="新建目标" subtitle="一个目标配 1-3 个可量化的指标">
        <div className="stack">
          <Field label="目标">
            <input
              className="input"
              value={gTitle}
              onChange={(e) => setGTitle(e.target.value)}
              placeholder="例如：这个月读完 4 本书"
              autoFocus
            />
          </Field>
          <Field label="周期">
            <div className="row" style={{ gap: 6 }}>
              {([
                { v: 'week', label: '周' },
                { v: 'month', label: '月' },
                { v: 'quarter', label: '季度' },
              ] as const).map((h) => (
                <button
                  key={h.v}
                  className={`pill${gHorizon === h.v ? ' active' : ''}`}
                  onClick={() => {
                    setGHorizon(h.v)
                    setGDue(addDays(today, h.v === 'week' ? 7 : h.v === 'month' ? 30 : 90))
                  }}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="截止日期">
            <input className="input" type="date" value={gDue} onChange={(e) => setGDue(e.target.value)} />
          </Field>
          <button className="btn btn-primary btn-block" onClick={submitGoal} disabled={!gTitle.trim()}>
            创建
          </button>
          <div className="card-sub">创建后可以在目标卡片里继续添加量化指标。</div>
        </div>
      </Sheet>

      <Sheet
        open={!!krTarget}
        onClose={() => setKrTarget(null)}
        title="添加指标"
        subtitle={krTarget ? krTarget.title : undefined}
      >
        <div className="stack">
          <Field label="指标名称">
            <input className="input" value={krTitle} onChange={(e) => setKrTitle(e.target.value)} placeholder="例如：读完 4 本" autoFocus />
          </Field>
          <div className="grid-3">
            <Field label="目标值">
              <input
                className="input num"
                value={krTargetValue}
                inputMode="numeric"
                onChange={(e) => setKrTargetValue(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="4"
              />
            </Field>
            <Field label="单位">
              <input className="input" value={krUnit} onChange={(e) => setKrUnit(e.target.value)} placeholder="本" />
            </Field>
          </div>
          <button className="btn btn-primary btn-block" onClick={submitKr}>
            添加
          </button>
        </div>
      </Sheet>
    </>
  )
}
