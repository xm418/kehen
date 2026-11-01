import { useState } from 'react'
import { useStore } from '../state/store'
import { useTimerSeconds, useTodayKey } from '../hooks/useClock'
import { focusByDay, focusMinutesOn, isCleanSession, sessionDate } from '../core/stats'
import { timeToText, weekdayLabel, minutesToText } from '../core/date'
import { SparkBars, BarList } from '../components/Charts'
import type { TimerMode } from '../core/types'

export function FocusPage() {
  const { data, actions } = useStore()
  const today = useTodayKey()
  const seconds = useTimerSeconds()
  const [customMin, setCustomMin] = useState('')

  const timer = data.timer
  const config = data.settings.pomodoro
  const isBreak = timer.mode === 'break'
  const todaySessions = data.sessions
    .filter((s) => s.mode === 'focus' && sessionDate(s.startedAt) === today)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
  const totalMin = focusMinutesOn(data.sessions, today)
  // 中断两次以上的那段还计入时长，但不再算「完整番茄」
  const cleanCount = todaySessions.filter(isCleanSession).length
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
              <span className="num muted">
                {s.minutes} 分钟
                {(s.interruptions ?? 0) > 0 ? ` · 中断 ${s.interruptions} 次` : ''}
              </span>
            </div>
          ))
        )}
      </section>
    </>
  )
}
