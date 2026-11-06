import { useState } from 'react'
import { useStore } from '../state/store'
import { useTimerSeconds, useTodayKey } from '../hooks/useClock'
import {
  focusMinutesOn,
  habitDayProgress,
  habitStreak,
  isHabitDone,
  dueReviews,
  focusByDay,
  buildDailyAdvice,
} from '../core/stats'
import { formatFull, formatShort, timeToText, weekdayLabel } from '../core/date'
import { Ring, SparkBars } from '../components/Charts'
import { StudyForm } from '../components/StudyForm'
import { Icon } from '../components/Icons'
import { SupervisionPanel } from '../components/SupervisionPanel'
import { DailyPoem } from '../components/DailyPoem'
import { TodayPlanCard, TomorrowPlanCard } from '../components/PlanCards'

type Tab = 'today' | 'habits' | 'focus' | 'notes' | 'words' | 'review'

export function TodayPage({ goTo }: { goTo: (t: Tab) => void }) {
  const { data, actions } = useStore()
  const today = useTodayKey()
  const seconds = useTimerSeconds()
  const [studyOpen, setStudyOpen] = useState(false)

  const progress = habitDayProgress(data.habits, data.habitLogs, today)
  const ratio = progress.total === 0 ? 0 : progress.doneCount / progress.total
  const focusMin = focusMinutesOn(data.sessions, today)
  const todayLogs = data.studyLogs.filter((l) => l.date === today)
  const due = dueReviews(data.studyLogs, today)
  const review = data.dailyReviews.find((r) => r.date === today)
  const bestStreak = Math.max(
    0,
    ...data.habits.filter((h) => !h.archived).map((h) => habitStreak(h, data.habitLogs, today).current),
  )
  const trend = focusByDay(data.sessions, today, 7)

  // 今日行动建议：规则化 AI 教练
  const advice = buildDailyAdvice(data, today)

  // 单词模块的今日进度，首页给一个入口，不用每次都切到单词页看
  const wordGoal = data.settings.words.dailyGoal
  const wordDone = data.wordProgress.date === today ? data.wordProgress.count : 0
  const wordDue = data.words.filter(
    (w) => w.familiar === 0 && (!w.nextReviewAt || w.nextReviewAt <= today),
  ).length
  const wordWrong = data.words.filter((w) => w.wrong).length

  const timer = data.timer
  const isBreak = timer.mode === 'break'

  const hour = new Date().getHours()
  const greet = hour < 5 ? '还没睡' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
  const nick = data.settings.nickname.trim()

  return (
    <>
      <SupervisionPanel />
      <div className="today-hero">
        <div>
          <div className="eyebrow">
            {greet}
            {nick ? `，${nick}` : ''}
          </div>
          <h2 className="date-title" style={{ marginTop: 6 }}>
            {formatShort(today)} 周{weekdayLabel(today)}
          </h2>
          <div className="date-sub">
            {formatFull(today)}
            {bestStreak > 0 ? ` · 最长连击 ${bestStreak} 天` : ''}
          </div>
        </div>
        <div className="hero-ring">
          <Ring value={ratio} size={72} stroke={4}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {Math.round(ratio * 100)}%
            </span>
          </Ring>
        </div>
      </div>

      <div className="metric-row" style={{ marginBottom: 14 }}>
        <div className="metric">
          <div className="metric-value">
            {progress.doneCount}/{progress.total}
          </div>
          <div className="metric-label">习惯打卡</div>
        </div>
        <div className="metric">
          <div className="metric-value">{focusMin}</div>
          <div className="metric-label">专注分钟</div>
        </div>
        <div className="metric">
          <div className="metric-value">{todayLogs.length}</div>
          <div className="metric-label">学习记录</div>
        </div>
      </div>

      <TodayPlanCard onFocus={() => goTo('focus')} />

      {advice.length > 0 ? (
        <section className="card" style={{ marginBottom: 12 }}>
          <div className="card-head">
            <div>
              <h3 className="card-title">今天第一件事</h3>
              <div className="card-sub">根据你的习惯、专注和历史数据，挑了几条现在最值得做的</div>
            </div>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {advice.map((a, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  padding: '8px 10px',
                  background: 'var(--bg-elev)',
                  borderRadius: 10,
                  fontSize: 14,
                  lineHeight: 1.65,
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1 }}>{a.emoji}</span>
                <span style={{ flex: 1 }}>{a.text}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="row-between" style={{ marginBottom: 10 }}>
          <div>
            <h3 className="card-title">今天的单词</h3>
            <div className="card-sub">
              {data.words.length === 0
                ? '词库还是空的，先去导入一本'
                : `已学 ${wordDone}/${wordGoal} · 待学 ${wordDue} 个${wordWrong > 0 ? ` · 错词 ${wordWrong}` : ''}`}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => goTo('words')}>
            {wordDue > 0 ? `去背 ${wordDue} 个` : '打开单词本'}
          </button>
        </div>
        {data.words.length > 0 ? (
          <>
            <div className="prog">
              <div
                className="prog-fill"
                style={{ width: `${Math.min(100, Math.round((wordDone / Math.max(1, wordGoal)) * 100))}%` }}
              />
            </div>
            <div className="row-between" style={{ marginTop: 6, fontSize: 12 }}>
              <span className="muted">每日目标 {wordGoal} 个</span>
              <span className="muted">
                {wordDone >= wordGoal ? '今天已经够了' : `还差 ${wordGoal - wordDone} 个`}
              </span>
            </div>
          </>
        ) : null}
      </section>

      <DailyPoem />

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">今天要守住的习惯</h3>
              <div className="card-sub">
                {progress.total === 0 ? '还没有设定习惯' : ratio === 1 ? '全部完成，保持住' : '点一下就算完成'}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => goTo('habits')}>
              管理
            </button>
          </div>

          {progress.active.length === 0 ? (
            <div className="empty">
              去「习惯」页面加一条，
              <br />
              从每天只做 5 分钟开始最容易坚持。
            </div>
          ) : (
            progress.active.map((h) => {
              const done = isHabitDone(h, data.habitLogs, today)
              const count =
                data.habitLogs.find((l) => l.habitId === h.id && l.date === today)?.count ?? 0
              const streak = habitStreak(h, data.habitLogs, today)
              return (
                <div className="habit-row" key={h.id}>
                  <button
                    className={`habit-tick${done ? ' on' : ''}`}
                    onClick={() => actions.toggleHabit(h.id, today)}
                    aria-label={`打卡 ${h.name}`}
                  >
                    <Icon name="check" size={15} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="habit-name">{h.name}</div>
                    <div className="habit-meta">
                      {h.schedule.type === 'daily'
                        ? '每天'
                        : h.schedule.type === 'weekdays'
                          ? `每周 ${h.schedule.days.length} 天`
                          : `每周 ${h.schedule.times} 次`}
                      {streak.current > 0 ? ` · 连续 ${streak.current} 天` : ''}
                    </div>
                  </div>
                  {h.targetPerDay > 1 ? (
                    <div className="stepper">
                      <button onClick={() => actions.stepHabit(h.id, -1, today)} aria-label="减少">
                        −
                      </button>
                      <span className="habit-count">
                        {count}/{h.targetPerDay}
                      </span>
                      <button onClick={() => actions.stepHabit(h.id, 1, today)} aria-label="增加">
                        +
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </section>

        <div className="stack">
          <section className="card">
            <div className="row-between" style={{ marginBottom: 12 }}>
              <div className="eyebrow">{isBreak ? '休息中' : '专注'}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => goTo('focus')}>
                打开计时器
              </button>
            </div>
            <div className="timer-mini">
              <div>
                <div className="timer-mini-time">{timeToText(seconds)}</div>
                <div className="card-sub" style={{ marginTop: 6 }}>
                  {timer.running ? (isBreak ? '放松一下眼睛' : '保持当前任务') : '随时开始一个番茄'}
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (timer.running) actions.pauseTimer()
                  else if (timer.plannedSeconds - timer.remainSeconds > 0) actions.resumeTimer()
                  else actions.startTimer(timer.mode, timer.plannedSeconds, timer.subject)
                }}
              >
                {timer.running ? '暂停' : '开始'}
              </button>
            </div>
          </section>

          <section className="card">
            <div className="row-between" style={{ marginBottom: 12 }}>
              <h3 className="card-title">今日学习</h3>
              <div className="row" style={{ gap: 4 }}>
                {todayLogs.length > 3 ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => goTo('notes')}>
                    全部
                  </button>
                ) : null}
                <button className="btn btn-ghost btn-sm" onClick={() => setStudyOpen(true)}>
                  ＋ 记一条
                </button>
              </div>
            </div>
            {todayLogs.length === 0 ? (
              <div className="empty">今天还没记录。哪怕只写下三行，也比什么都不留强。</div>
            ) : (
              todayLogs.slice(0, 3).map((l) => (
                <div key={l.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className="row-between">
                    <span style={{ fontSize: 13.5, fontWeight: 550 }}>{l.title}</span>
                    <span className="num muted" style={{ fontSize: 11.5 }}>
                      {l.minutes} 分钟
                    </span>
                  </div>
                  <div className="log-meta" style={{ marginTop: 3 }}>
                    <span>{l.subject}</span>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <section className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">最近 7 天专注</h3>
              <div className="card-sub">灰色为未达标，黑色为今天</div>
            </div>
            <span className="num muted" style={{ fontSize: 12 }}>
              {trend.reduce((a, t) => a + t.minutes, 0)} 分钟
            </span>
          </div>
          <SparkBars
            items={trend.map((t) => ({
              key: t.key,
              value: t.minutes,
              label: weekdayLabel(t.key),
            }))}
          />
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">今日自评</h3>
              <div className="card-sub">{review ? `已评分 ${review.score} 分` : '给自己今天的执行打个分'}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => goTo('review')}>
              去复盘
            </button>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                className={`pill${review?.score === s ? ' active' : ''}`}
                style={{ flex: 1, justifyContent: 'center', padding: '8px 0' }}
                onClick={() =>
                  actions.saveDailyReview({
                    date: today,
                    score: s,
                    wentWell: review?.wentWell ?? '',
                    blocked: review?.blocked ?? '',
                    tomorrow: review?.tomorrow ?? '',
                  })
                }
              >
                {s}
              </button>
            ))}
          </div>
          {due.length > 0 ? (
            <>
              <hr className="divider" />
              <div className="row-between">
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 550 }}>{due.length} 条内容该复习了</div>
                  <div className="card-sub">{due[0].title}</div>
                </div>
                <button className="btn btn-sm" onClick={() => goTo('notes')}>
                  去复习
                </button>
              </div>
            </>
          ) : null}
        </section>
      </div>

      <TomorrowPlanCard />

      <StudyForm open={studyOpen} onClose={() => setStudyOpen(false)} />
    </>
  )
}
