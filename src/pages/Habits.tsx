import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { useTodayKey } from '../hooks/useClock'
import {
  habitCountOn,
  habitDayProgress,
  habitHealthScore,
  habitStreak,
  habitResilience,
  isHabitDone,
  isHabitScheduled,
} from '../core/stats'
import { addDays, lastNDays, rangeKeys, startOfWeek } from '../core/date'
import { Heatmap, Ring } from '../components/Charts'
import { Sheet, Field, Segmented } from '../components/Sheet'
import { Icon } from '../components/Icons'
import { SupervisionPanel } from '../components/SupervisionPanel'
import { isHabitCreationLocked } from '../core/supervision'
import type { EnergySlot, Habit, HabitSchedule } from '../core/types'

type Mode = 'daily' | 'weekdays' | 'weekly'
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0]
const DAY_LABEL = ['日', '一', '二', '三', '四', '五', '六']

const SLOT_OPTIONS: { value: EnergySlot; label: string; emoji: string }[] = [
  { value: 'morning', label: '早起', emoji: '🌅' },
  { value: 'midday', label: '中午', emoji: '☀️' },
  { value: 'afternoon', label: '下午', emoji: '🍵' },
  { value: 'evening', label: '睡前', emoji: '🌙' },
  { value: 'any', label: '随便', emoji: '🔄' },
]

const SLOT_LABEL: Record<EnergySlot, string> = {
  morning: '早起',
  midday: '中午',
  afternoon: '下午',
  evening: '睡前',
  any: '随便',
}

function modeOf(s: HabitSchedule): Mode {
  return s.type === 'daily' ? 'daily' : s.type === 'weekdays' ? 'weekdays' : 'weekly'
}

function HabitEditor({
  open,
  habit,
  onClose,
}: {
  open: boolean
  habit: Habit | null
  onClose: () => void
}) {
  const { actions } = useStore()
  const [name, setName] = useState('')
  const [target, setTarget] = useState('1')
  const [mode, setMode] = useState<Mode>('daily')
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [times, setTimes] = useState('3')
  const [note, setNote] = useState('')
  const [slot, setSlot] = useState<EnergySlot>('any')

  useEffect(() => {
    if (!open) return
    setName(habit?.name ?? '')
    setTarget(String(habit?.targetPerDay ?? 1))
    setMode(habit ? modeOf(habit.schedule) : 'daily')
    setDays(habit && habit.schedule.type === 'weekdays' ? habit.schedule.days : [1, 2, 3, 4, 5])
    setTimes(habit && habit.schedule.type === 'weekly' ? String(habit.schedule.times) : '3')
    setNote(habit?.note ?? '')
    setSlot(habit?.preferredSlot ?? 'any')
  }, [open, habit])

  const submit = () => {
    if (!name.trim()) return
    const schedule: HabitSchedule =
      mode === 'daily'
        ? { type: 'daily' }
        : mode === 'weekdays'
          ? { type: 'weekdays', days: days.length ? days : [1, 2, 3, 4, 5] }
          : { type: 'weekly', times: Math.max(1, Math.min(7, Number(times) || 3)) }
    const payload = {
      name: name.trim(),
      targetPerDay: Math.max(1, Number(target) || 1),
      schedule,
      note: note.trim() || undefined,
      preferredSlot: slot === 'any' ? undefined : slot,
    }
    if (habit) actions.updateHabit(habit.id, payload)
    else actions.addHabit(payload)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={habit ? '编辑习惯' : '新建习惯'} subtitle="目标定小一点，比定完美更重要">
      <div className="stack">
        <Field label="习惯名称">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：早起、阅读 20 分钟"
            autoFocus
          />
        </Field>

        <Field label="每天需要完成几次">
          <input
            className="input num"
            value={target}
            inputMode="numeric"
            onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="1"
          />
        </Field>

        <Field label="重复方式">
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'daily', label: '每天' },
              { value: 'weekdays', label: '指定星期' },
              { value: 'weekly', label: '每周几次' },
            ]}
          />
        </Field>

        {mode === 'weekdays' ? (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`pill${days.includes(d) ? ' active' : ''}`}
                style={{ width: 38, justifyContent: 'center' }}
                onClick={() =>
                  setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
                }
              >
                {DAY_LABEL[d]}
              </button>
            ))}
          </div>
        ) : null}

        {mode === 'weekly' ? (
          <Field label="每周目标次数">
            <input
              className="input num"
              value={times}
              inputMode="numeric"
              onChange={(e) => setTimes(e.target.value.replace(/[^\d]/g, ''))}
            />
          </Field>
        ) : null}

        <Field label="你的高效时段">
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {SLOT_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`pill${slot === o.value ? ' active' : ''}`}
                onClick={() => setSlot(o.value)}
              >
                {o.emoji} {o.label}
              </button>
            ))}
          </div>
          <div className="card-sub">把难习惯放到你状态最好的时段，更容易坚持</div>
        </Field>

        <Field label="备注（可选）">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="为什么想坚持它" />
        </Field>

        <button className="btn btn-primary btn-block" onClick={submit} disabled={!name.trim()}>
          保存
        </button>
      </div>
    </Sheet>
  )
}

export function HabitsPage() {
  const { data, actions } = useStore()
  const today = useTodayKey()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Habit | null>(null)
  const [backfill, setBackfill] = useState<Habit | null>(null)
  const [backfillDate, setBackfillDate] = useState(today)
  const [backfillCount, setBackfillCount] = useState(1)

  const openBackfill = (h: Habit) => {
    const yesterday = addDays(today, -1)
    setBackfill(h)
    setBackfillDate(yesterday < h.createdAt ? h.createdAt : yesterday)
    setBackfillCount(h.targetPerDay)
  }

  const saveBackfill = () => {
    if (!backfill) return
    actions.setHabitCount(backfill.id, backfillDate, backfillCount)
    setBackfill(null)
  }

  const active = data.habits.filter((h) => !h.archived)
  const archived = data.habits.filter((h) => h.archived)
  const progress = habitDayProgress(data.habits, data.habitLogs, today)
  const locked = isHabitCreationLocked(data)

  const rateOf = (habit: Habit) => {
    const days = lastNDays(30, today)
    let scheduled = 0
    let done = 0
    for (const key of days) {
      if (!isHabitScheduled(habit, key)) continue
      scheduled++
      if (isHabitDone(habit, data.habitLogs, key)) done++
    }
    return scheduled === 0 ? 0 : done / scheduled
  }

  const heatOf = (habit: Habit) =>
    lastNDays(140, today).map((key) => ({
      key,
      ratio: Math.min(
        1,
        (data.habitLogs.find((l) => l.habitId === habit.id && l.date === key)?.count ?? 0) /
          Math.max(1, habit.targetPerDay),
      ),
    }))

  // 年度概览：把所有习惯合到一张 GitHub 式热力图，外加「全员完成」连续天数
  const yearStats = useMemo(() => {
    const days = lastNDays(365, today)
    // null = 那天没有安排任何习惯，不算完美也不打断连续
    const perfectDay = (key: string): boolean | null => {
      const p = habitDayProgress(data.habits, data.habitLogs, key)
      if (p.total === 0) return null
      return p.doneCount >= p.total
    }
    const heat: { key: string; ratio: number }[] = []
    let doneSum = 0
    let totalSum = 0
    for (const key of days) {
      const p = habitDayProgress(data.habits, data.habitLogs, key)
      doneSum += p.doneCount
      totalSum += p.total
      heat.push({ key, ratio: p.total === 0 ? 0 : p.doneCount / p.total })
    }
    // 今天还没全完成时从昨天开始数，避免连续天数提前归零
    let current = 0
    let cur = perfectDay(today) === true ? today : addDays(today, -1)
    let guard = 0
    while (cur >= days[0] && guard < 370) {
      const p = perfectDay(cur)
      if (p === true) current++
      else if (p === false) break
      cur = addDays(cur, -1)
      guard++
    }
    let longest = 0
    let run = 0
    for (const key of days) {
      const p = perfectDay(key)
      if (p === true) {
        run++
        longest = Math.max(longest, run)
      } else if (p === false) run = 0
    }
    return { heat, current, longest, rate: totalSum === 0 ? 0 : doneSum / totalSum }
  }, [data.habits, data.habitLogs, today])

  return (
    <>
      <div className="row-between" style={{ marginBottom: 16 }}>
        <div>
          <div className="eyebrow">习惯</div>
          <h2 className="date-title" style={{ fontSize: 24, marginTop: 6 }}>
            在守的习惯
          </h2>
          <div className="date-sub">
            今天 {progress.doneCount}/{progress.total} · 共 {active.length} 个
          </div>
        </div>
        <button
          className="btn btn-primary"
          disabled={locked}
          title={locked ? '还有补救任务没完成，先补做完再新增' : undefined}
          onClick={() => {
            setEditing(null)
            setOpen(true)
          }}
        >
          ＋ 新建
        </button>
      </div>

      <SupervisionPanel compact />

      {active.length > 0 ? (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="row-between" style={{ marginBottom: 10, alignItems: 'flex-start' }}>
            <div>
              <h3 className="card-title">年度概览</h3>
              <div className="card-sub">
                全员完成连续 {yearStats.current} 天 · 最长 {yearStats.longest} 天 · 近一年打卡率{' '}
                {Math.round(yearStats.rate * 100)}%
              </div>
            </div>
          </div>
          <Heatmap values={yearStats.heat} weeks={53} end={today} />
          <div className="heat-legend">
            少
            <div className="heat-cell l1" style={{ display: 'inline-block' }} />
            <div className="heat-cell l2" style={{ display: 'inline-block' }} />
            <div className="heat-cell l3" style={{ display: 'inline-block' }} />
            <div className="heat-cell l4" style={{ display: 'inline-block' }} />
            多
          </div>
        </section>
      ) : null}

      <div className="stack">
        {active.length === 0 ? (
          <div className="card">
            <div className="empty">还没有习惯。先加一个每天 5 分钟就能完成的小目标。</div>
          </div>
        ) : null}

        {active.map((h) => {
          const streak = habitStreak(h, data.habitLogs, today)
          const rate = rateOf(h)
          const res = habitResilience(h, data.habitLogs, today)
          const health = habitHealthScore(h, data.habitLogs, today)
          const done = isHabitDone(h, data.habitLogs, today)
          const isRestToday = data.habitLogs.some(
            (l) => l.habitId === h.id && l.date === today && l.restDay,
          )
          // 「每周几次」的连续单位是周，写死「天」会误导
          const streakUnit = h.schedule.type === 'weekly' ? '周' : '天'
          // 本周已经做满几次，让「每周几次」的习惯有明确进度
          const weekCount =
            h.schedule.type === 'weekly'
              ? rangeKeys(startOfWeek(today), today).reduce(
                  (n, key) => n + habitCountOn(data.habitLogs, h.id, key),
                  0,
                )
              : 0
          const slotLabel = h.preferredSlot ? SLOT_LABEL[h.preferredSlot] : null
          const resilienceColor = res.rate >= 80 ? 'var(--success)' : res.rate >= 40 ? 'var(--accent)' : 'var(--danger)'
          return (
            <section className="card" key={h.id}>
              <div className="row-between" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <h3 className="card-title">{h.name}</h3>
                    {done ? <span className="tag">今天已完成</span> : null}
                    {slotLabel ? <span className="tag tag-ghost">⏰ {slotLabel}</span> : null}
                  </div>
                  <div className="card-sub">
                    {h.schedule.type === 'weekly' ? `本周 ${weekCount}/${h.schedule.times} 次 · ` : ''}
                    连续 {streak.current} {streakUnit} · 最长 {streak.longest} {streakUnit} · 健康度{' '}
                    <span
                      style={{
                        fontWeight: 600,
                        color: health.score >= 80 ? 'var(--success)' : health.score >= 50 ? 'var(--accent)' : 'var(--danger)',
                      }}
                    >
                      {health.score}%
                      {health.trend === 'up' ? ' ↑' : health.trend === 'down' ? ' ↓' : ''}
                    </span>{' '}
                    ·{' '}
                    <span style={{ color: resilienceColor, fontWeight: 600 }}>
                      恢复率 {res.rate}%
                    </span>
                    {isRestToday ? ' · 今天标记为休息日 🛌' : ''}
                    {h.note ? ` · ${h.note}` : ''}
                  </div>
                </div>
                <Ring value={rate} size={44} stroke={3} />
              </div>

              <Heatmap values={heatOf(h)} weeks={20} end={today} />

              <div className="row" style={{ gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                <button
                  className={`btn btn-sm${done ? '' : ' btn-primary'}`}
                  onClick={() => actions.toggleHabit(h.id, today)}
                >
                  {done ? '取消今天的打卡' : '打卡今天'}
                </button>
                <button
                  className={`btn btn-sm${isRestToday ? ' btn-primary' : ''}`}
                  style={isRestToday ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : {}}
                  onClick={() => actions.toggleRestDay(h.id, today)}
                  title="今天不想做这件事？标成休息日，既不算完成也不算断签"
                >
                  {isRestToday ? '取消休息日' : '🛌 今天休息'}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    setEditing(h)
                    setOpen(true)
                  }}
                >
                  编辑
                </button>
                <button className="btn btn-sm" onClick={() => openBackfill(h)}>
                  补录
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => actions.setHabitArchived(h.id, true)}>
                  暂停
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => {
                    if (confirm(`删除「${h.name}」及其全部打卡记录？`)) actions.removeHabit(h.id)
                  }}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </section>
          )
        })}

        {archived.length > 0 ? (
          <section className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title">已暂停</h3>
                <div className="card-sub">记录都还在，随时可以恢复</div>
              </div>
            </div>
            {archived.map((h) => (
              <div className="row-between" key={h.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="muted" style={{ fontSize: 13.5 }}>
                  {h.name}
                </span>
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => actions.setHabitArchived(h.id, false)}>
                    恢复
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      if (confirm(`彻底删除「${h.name}」？`)) actions.removeHabit(h.id)
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </div>

      <Sheet
        open={!!backfill}
        onClose={() => setBackfill(null)}
        title="补录打卡"
        subtitle={backfill ? `${backfill.name} · 补录不计入连续天数` : undefined}
      >
        <div className="stack">
          {backfill && backfill.createdAt >= today ? (
            <div className="empty">这个习惯今天才建立，还没有可补录的日子。</div>
          ) : (
            <>
              <Field label="补哪一天">
                <input
                  className="input"
                  type="date"
                  value={backfillDate}
                  min={backfill?.createdAt}
                  max={addDays(today, -1)}
                  onChange={(e) => setBackfillDate(e.target.value || today)}
                />
              </Field>
              <Field label={`完成次数（每天目标 ${backfill?.targetPerDay ?? 1} 次）`}>
                <div className="stepper">
                  <button aria-label="减少" onClick={() => setBackfillCount((n) => Math.max(0, n - 1))}>
                    −
                  </button>
                  <span className="habit-count" style={{ minWidth: 48, textAlign: 'center' }}>
                    {backfillCount}/{backfill?.targetPerDay ?? 1}
                  </span>
                  <button
                    aria-label="增加"
                    onClick={() => setBackfillCount((n) => Math.min(backfill?.targetPerDay ?? 1, n + 1))}
                  >
                    ＋
                  </button>
                </div>
                <div className="card-sub">设成 0 会清掉那天的打卡记录。</div>
              </Field>
              <button className="btn btn-primary btn-block" onClick={saveBackfill}>
                保存补录
              </button>
            </>
          )}
        </div>
      </Sheet>

      <HabitEditor open={open} habit={editing} onClose={() => setOpen(false)} />
    </>
  )
}
