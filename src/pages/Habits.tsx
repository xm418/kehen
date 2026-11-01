import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { useTodayKey } from '../hooks/useClock'
import { habitDayProgress, habitStreak, isHabitDone, isHabitScheduled } from '../core/stats'
import { lastNDays } from '../core/date'
import { Heatmap, Ring } from '../components/Charts'
import { Sheet, Field, Segmented } from '../components/Sheet'
import { Icon } from '../components/Icons'
import { SupervisionPanel } from '../components/SupervisionPanel'
import { isHabitCreationLocked } from '../core/supervision'
import type { Habit, HabitSchedule } from '../core/types'

type Mode = 'daily' | 'weekdays' | 'weekly'
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0]
const DAY_LABEL = ['日', '一', '二', '三', '四', '五', '六']

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

  useEffect(() => {
    if (!open) return
    setName(habit?.name ?? '')
    setTarget(String(habit?.targetPerDay ?? 1))
    setMode(habit ? modeOf(habit.schedule) : 'daily')
    setDays(habit && habit.schedule.type === 'weekdays' ? habit.schedule.days : [1, 2, 3, 4, 5])
    setTimes(habit && habit.schedule.type === 'weekly' ? String(habit.schedule.times) : '3')
    setNote(habit?.note ?? '')
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

      <div className="stack">
        {active.length === 0 ? (
          <div className="card">
            <div className="empty">还没有习惯。先加一个每天 5 分钟就能完成的小目标。</div>
          </div>
        ) : null}

        {active.map((h) => {
          const streak = habitStreak(h, data.habitLogs, today)
          const rate = rateOf(h)
          const done = isHabitDone(h, data.habitLogs, today)
          // 「每周几次」的连续单位是周，写死「天」会误导
          const streakUnit = h.schedule.type === 'weekly' ? '周' : '天'
          return (
            <section className="card" key={h.id}>
              <div className="row-between" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <h3 className="card-title">{h.name}</h3>
                    {done ? <span className="tag">今天已完成</span> : null}
                  </div>
                  <div className="card-sub">
                    连续 {streak.current} {streakUnit} · 最长 {streak.longest} {streakUnit} · 近 30 天完成率{' '}
                    {Math.round(rate * 100)}%
                    {h.note ? ` · ${h.note}` : ''}
                  </div>
                </div>
                <Ring value={rate} size={44} stroke={3} />
              </div>

              <Heatmap values={heatOf(h)} weeks={20} end={today} />

              <div className="row" style={{ gap: 6, marginTop: 12 }}>
                <button
                  className={`btn btn-sm${done ? '' : ' btn-primary'}`}
                  onClick={() => actions.toggleHabit(h.id, today)}
                >
                  {done ? '取消今天的打卡' : '打卡今天'}
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

      <HabitEditor open={open} habit={editing} onClose={() => setOpen(false)} />
    </>
  )
}
