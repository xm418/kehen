import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useTimerSeconds, useTodayKey } from '../hooks/useClock'
import {
  focusByDay,
  focusMilestoneMessage,
  focusMinutesOn,
  isCleanSession,
  sessionDate,
  GACHA_POOL,
  type GachaItem,
} from '../core/stats'
import { addDays, formatShort, lastNDays, timeToText, weekdayLabel, minutesToText } from '../core/date'
import { Heatmap, SparkBars, BarList } from '../components/Charts'
import { FocusSupervisor } from '../components/SupervisorPet'
import type { FocusSession, TimerMode } from '../core/types'

export function FocusPage() {
  const { data, actions } = useStore()
  const today = useTodayKey()
  const seconds = useTimerSeconds()
  const [customMin, setCustomMin] = useState('')

  const timer = data.timer
  const config = data.settings.pomodoro
  const isBreak = timer.mode === 'break'

  /* 专注扭蛋 + 里程碑反馈：专注刚结束时弹一个 4 秒 toast */
  const lastGachaLenRef = useRef<number>(data.focusGacha?.length ?? 0)
  const [gachaToast, setGachaToast] = useState<{ item: GachaItem; milestone?: string } | null>(null)
  useEffect(() => {
    const cur = data.focusGacha?.length ?? 0
    if (cur > lastGachaLenRef.current) {
      const latest = data.focusGacha![cur - 1]
      const id = latest.slice(2) // emoji 占 2 个 UTF-16 code unit 简化处理
      const item =
        GACHA_POOL.find((g) => `${g.emoji}${g.id}` === latest) ??
        GACHA_POOL.find((g) => g.id === id) ??
        GACHA_POOL[0]
      const ms = focusMilestoneMessage(data.sessions, today)
      setGachaToast({ item, milestone: ms?.title })
      lastGachaLenRef.current = cur
      const t = setTimeout(() => setGachaToast(null), 4200)
      return () => clearTimeout(t)
    }
    lastGachaLenRef.current = cur
  }, [data.focusGacha, data.sessions, today])
  const todaySessions = data.sessions
    .filter((s) => s.mode === 'focus' && sessionDate(s.startedAt) === today)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
  const totalMin = focusMinutesOn(data.sessions, today)
  // 中断两次以上的那段还计入时长，但不再算「完整番茄」
  const cleanCount = todaySessions.filter(isCleanSession).length
  // 今天之前的 6 天，方便回看这几段专注做了什么
  const pastSessions = data.sessions
    .filter((s) => {
      const key = sessionDate(s.startedAt)
      return s.mode === 'focus' && key < today && key >= addDays(today, -6)
    })
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
  const trend = focusByDay(data.sessions, today, 7)
  // 今天还没勾掉的计划，可以直接挑一条作为这一段专注的目标
  const openPlan = (data.plans.find((p) => p.date === today)?.items ?? []).filter((i) => !i.done)

  const subjectBuckets = new Map<string, number>()
  for (const s of data.sessions) {
    if (s.mode !== 'focus') continue
    const name = s.subject?.trim() || '未命名'
    subjectBuckets.set(name, (subjectBuckets.get(name) ?? 0) + s.minutes)
  }
  const subjectList = [...subjectBuckets.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  /* 年度热力图 + 24 小时时段分布（学 Forest）：看长期节奏和高效时段 */
  const { heatValues, yearTotal, heatPeak, hourItems } = useMemo(() => {
    const byDay = new Map<string, number>()
    const hours = new Array<number>(24).fill(0)
    for (const s of data.sessions) {
      if (s.mode !== 'focus') continue
      const k = sessionDate(s.startedAt)
      byDay.set(k, (byDay.get(k) ?? 0) + s.minutes)
      hours[new Date(s.startedAt).getHours()] += s.minutes
    }
    // 峰值封顶 60 分钟起，免得前期数据少时颜色全是满格
    const peak = Math.max(60, ...byDay.values())
    const days = lastNDays(365, today)
    return {
      heatValues: days.map((k) => ({ key: k, ratio: (byDay.get(k) ?? 0) / peak })),
      yearTotal: days.reduce((a, k) => a + (byDay.get(k) ?? 0), 0),
      heatPeak: peak,
      hourItems: hours.map((v, h) => ({ key: `h${h}`, value: v, label: h % 6 === 0 ? `${h}时` : '' })),
    }
  }, [data.sessions, today])

  const start = (mode: TimerMode, min: number) => {
    actions.startTimer(mode, min * 60, data.timer.subject)
  }

  const applyCustom = () => {
    const n = Number(customMin)
    if (!n || n <= 0 || n > 240) return
    actions.resetTimer(n * 60, 'focus')
    setCustomMin('')
  }

  const progress = timer.plannedSeconds === 0 ? 0 : 1 - seconds / timer.plannedSeconds

  /** 记错了或者不想留的专注记录可以删掉 */
  const dropSession = (s: FocusSession) => {
    if (confirm(`删除这段 ${s.minutes} 分钟的专注记录？删掉后统计会跟着变。`)) {
      actions.removeSession(s.id)
    }
  }

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div className="eyebrow">专注</div>
        <h2 className="date-title" style={{ fontSize: 24, marginTop: 6 }}>
          一次只做一件事
        </h2>
        <div className="date-sub">
          今天累计 {minutesToText(totalMin)} · {cleanCount} 个完整番茄
        </div>
      </div>

      <section className="card timer-card">
        <div className="timer-phase">{isBreak ? `休息 · 第 ${timer.round} 轮` : `专注 · 第 ${timer.round} 轮`}</div>
        <div className="timer-time">{timeToText(seconds)}</div>
        <div className="timer-sub">
          {timer.running ? '计时进行中，把手机翻个面' : timer.plannedSeconds / 60 + ' 分钟一段'}
        </div>

        <div style={{ maxWidth: 340, margin: '16px auto 0' }}>
          <div className="prog">
            <div className="prog-fill" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
          </div>
        </div>

        <div className="timer-controls">
          {timer.running ? (
            <button className="btn btn-primary" onClick={() => actions.pauseTimer()}>
              暂停
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => {
                if (timer.remainSeconds > 0 && timer.remainSeconds < timer.plannedSeconds) actions.resumeTimer()
                else actions.startTimer(isBreak ? 'break' : 'focus', timer.plannedSeconds, data.timer.subject)
              }}
            >
              开始
            </button>
          )}
          <button className="btn" onClick={() => actions.resetTimer(timer.plannedSeconds, timer.mode)}>
            重置
          </button>
          <button
            className="btn btn-ghost"
            onClick={() =>
              isBreak
                ? start('focus', config.focus)
                : start('break', config.shortBreak)
            }
          >
            {isBreak ? '提前结束休息' : '直接休息'}
          </button>
        </div>

        <div className="quick-times">
          {[5, 15, 25, 45, 60].map((m) => (
            <button
              key={m}
              className={`pill${timer.plannedSeconds === m * 60 && timer.mode === 'focus' ? ' active' : ''}`}
              onClick={() => actions.resetTimer(m * 60, 'focus')}
            >
              {m} 分钟
            </button>
          ))}
          <input
            className="input num"
            style={{ width: 74, padding: '4px 8px', fontSize: 12.5 }}
            placeholder="自定义"
            value={customMin}
            inputMode="numeric"
            onChange={(e) => setCustomMin(e.target.value.replace(/[^\d]/g, ''))}
            onBlur={applyCustom}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyCustom()
            }}
          />
        </div>

        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <input
            className="input"
            style={{ maxWidth: 240, textAlign: 'center' }}
            value={data.timer.subject ?? ''}
            placeholder="这段在做什么（可选）"
            onChange={(e) => actions.setTimerSubject(e.target.value)}
          />
        </div>

        {openPlan.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <div className="eyebrow" style={{ textAlign: 'center', marginBottom: 8 }}>
              对准今天哪条计划（做完会自动勾掉）
            </div>
            <div className="row" style={{ gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              {openPlan.slice(0, 5).map((item) => {
                const on = timer.planItemId === item.id
                return (
                  <button
                    key={item.id}
                    className={`pill${on ? ' active' : ''}`}
                    style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    onClick={() =>
                      on
                        ? actions.setTimerPlan(undefined, '')
                        : actions.setTimerPlan(item.id, item.text)
                    }
                  >
                    {item.text}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <div
          className="row"
          style={{ gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}
        >
          <label className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
            <input
              type="checkbox"
              checked={data.settings.focus.lock}
              onChange={(e) =>
                actions.updateSettings({
                  focus: { ...data.settings.focus, lock: e.target.checked },
                })
              }
            />
            专注时锁住其他页面
          </label>
          <label className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
            <input
              type="checkbox"
              checked={data.settings.focus.keepAwake}
              onChange={(e) =>
                actions.updateSettings({
                  focus: { ...data.settings.focus, keepAwake: e.target.checked },
                })
              }
            />
            保持屏幕常亮
          </label>
          <label className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
            <input
              type="checkbox"
              checked={data.settings.pomodoro.autoStart}
              onChange={(e) =>
                actions.updateSettings({
                  pomodoro: { ...data.settings.pomodoro, autoStart: e.target.checked },
                })
              }
            />
            休息结束自动开始下一段
          </label>
        </div>

        {!isBreak && (timer.interruptions ?? 0) > 0 ? (
          <div className="card-sub" style={{ textAlign: 'center', marginTop: 8 }}>
            这一段已经中断 {timer.interruptions} 次，回来接着做也算数
          </div>
        ) : null}

        <FocusSupervisor />
      </section>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <section className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">最近 7 天专注时长</h3>
              <div className="card-sub">对比自己，不和别人比</div>
            </div>
            <span className="num muted" style={{ fontSize: 12 }}>
              {trend.reduce((a, t) => a + t.minutes, 0)} 分钟
            </span>
          </div>
          <SparkBars
            items={trend.map((t) => ({ key: t.key, value: t.minutes, label: weekdayLabel(t.key) }))}
            height={72}
          />
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">时间花在哪</h3>
              <div className="card-sub">按专注主题累计</div>
            </div>
          </div>
          <BarList items={subjectList} unit=" 分" emptyText="开始第一个番茄后，这里会有分布" />
        </section>
      </div>

      {yearTotal > 0 ? (
        <section className="card" style={{ marginTop: 12 }}>
          <div className="card-head">
            <div>
              <h3 className="card-title">这一年的专注</h3>
              <div className="card-sub">颜色越深当天越久 · 满格 ≈ {heatPeak} 分钟</div>
            </div>
            <span className="num muted" style={{ fontSize: 12 }}>
              共 {minutesToText(yearTotal)}
            </span>
          </div>
          <Heatmap values={heatValues} weeks={53} />

          <hr className="divider" />

          <div className="card-head">
            <div>
              <h3 className="card-title">一天里什么时候最专注</h3>
              <div className="card-sub">按每段专注的开始时间累计，把难事放到高峰时段</div>
            </div>
          </div>
          <SparkBars items={hourItems} height={64} />
        </section>
      ) : null}

      <section className="card" style={{ marginTop: 12 }}>
        <div className="card-head">
          <h3 className="card-title">今天的专注记录</h3>
          <span className="num muted" style={{ fontSize: 12 }}>
            {cleanCount} / {todaySessions.length} 段
          </span>
        </div>
        {todaySessions.length === 0 ? (
          <div className="empty">今天还没有完成的番茄。</div>
        ) : (
          todaySessions.map((s) => (
            <div className="session-row" key={s.id}>
              <span>
                {new Date(s.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                {s.subject || '未命名'}
              </span>
              <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                <span className="num muted">
                  {s.minutes} 分钟
                  {(s.interruptions ?? 0) > 0 ? ` · 中断 ${s.interruptions} 次` : ''}
                </span>
                <button
                  className="icon-btn"
                  style={{ width: 22, height: 22 }}
                  aria-label="删除这段专注记录"
                  onClick={() => dropSession(s)}
                >
                  ×
                </button>
              </span>
            </div>
          ))
        )}
      </section>
      {pastSessions.length > 0 ? (
        <section className="card" style={{ marginTop: 12 }}>
          <div className="card-head">
            <h3 className="card-title">前 6 天的专注</h3>
            <span className="num muted" style={{ fontSize: 12 }}>
              {pastSessions.length} 段
            </span>
          </div>
          {pastSessions.slice(0, 12).map((s) => (
            <div className="session-row" key={s.id}>
              <span>
                {formatShort(sessionDate(s.startedAt))} · {s.subject || '未命名'}
              </span>
              <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                <span className="num muted">
                  {s.minutes} 分钟
                  {(s.interruptions ?? 0) > 0 ? ` · 中断 ${s.interruptions} 次` : ''}
                </span>
                <button
                  className="icon-btn"
                  style={{ width: 22, height: 22 }}
                  aria-label="删除这段专注记录"
                  onClick={() => dropSession(s)}
                >
                  ×
                </button>
              </span>
            </div>
          ))}
          {pastSessions.length > 12 ? (
            <div className="card-sub" style={{ marginTop: 8 }}>
              只显示最近 12 段，更早的记录不再列出。
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 专注扭蛋弹层：专注刚完成时从底部滑上来，4 秒自动消失 */}
      {gachaToast ? (
        <div
          style={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: 80,
            zIndex: 999,
            animation: 'slideUp 0.35s ease-out',
          }}
          onClick={() => setGachaToast(null)}
        >
          <div
            style={{
              background: 'var(--bg-elev)',
              borderRadius: 14,
              padding: '14px 16px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
              border: `1px solid ${
                gachaToast.item.rarity === 'epic'
                  ? 'var(--accent)'
                  : gachaToast.item.rarity === 'rare'
                    ? 'rgba(100,180,255,0.4)'
                    : 'var(--border)'
              }`,
            }}
          >
            {gachaToast.milestone ? (
              <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, marginBottom: 4 }}>
                🎉 {gachaToast.milestone}
              </div>
            ) : null}
            <div className="row" style={{ gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 36, lineHeight: 1 }}>{gachaToast.item.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  {gachaToast.item.name}
                  {gachaToast.item.rarity === 'epic'
                    ? ' ✨'
                    : gachaToast.item.rarity === 'rare'
                      ? ' ★'
                      : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.5 }}>
                  {gachaToast.item.desc}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
