import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { useTodayKey } from '../hooks/useClock'
import { isPastDeadline, notifyOnce, todaysOpenHabits, unexcusedHabits } from '../core/supervision'
import { Icon } from './Icons'

/**
 * 强制拦截层：过了截止时间还有习惯没做完时盖住整个界面。
 * 只有两条路能关掉它——现在把习惯做掉，或者写下「我确实没做」的原因。
 */
export function SupervisionGate() {
  const { data, ready, actions } = useStore()
  const today = useTodayKey()
  const [now, setNow] = useState(() => new Date())
  const [reasonFor, setReasonFor] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  // 每分钟重新判断一次是否已经过点
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const cfg = data.settings.supervision
  const openHabits = todaysOpenHabits(data, today)
  const pending = unexcusedHabits(data, today)
  const visible = ready && cfg.intercept && isPastDeadline(cfg.deadlineHour, now) && pending.length > 0

  // 到点提醒一次（应用在前台时也能看到）
  useEffect(() => {
    if (!ready || !cfg.notify || !isPastDeadline(cfg.deadlineHour, now)) return
    if (openHabits.length === 0) return
    notifyOnce(today, '今天还有没做完的事', `${openHabits.map((h) => h.name).join('、')} 还空着`)
    // 只在跨过截止时间后触发一次
  }, [ready, cfg.notify, cfg.deadlineHour, now, openHabits.length, today])

  if (!visible) return null

  const submit = () => {
    if (!reasonFor || reason.trim().length < 2) return
    actions.recordIntercept(reasonFor, reason.trim())
    setReasonFor(null)
    setReason('')
  }

  return (
    <div className="gate-backdrop" role="dialog" aria-modal="true">
      <div className="gate">
        <div className="gate-head">
          <div className="gate-mark">
            <Icon name="focus" size={18} />
          </div>
          <div>
            <div className="eyebrow">今天的截止时间已过</div>
            <h2 className="gate-title">还有 {pending.length} 件事没做</h2>
            <div className="card-sub">截止时间 {cfg.deadlineHour}:00 · 做完可以马上关掉</div>
          </div>
        </div>

        <div className="gate-list">
          {pending.map((h) => (
            <div className="gate-item" key={h.id}>
              <div className="gate-item-head">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="habit-name">{h.name}</div>
                  <div className="habit-meta">
                    {h.schedule.type === 'daily'
                      ? '每天'
                      : h.schedule.type === 'weekdays'
                        ? '指定星期'
                        : `每周 ${h.schedule.times} 次`}
                  </div>
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => actions.toggleHabit(h.id, today)}>
                  现在做完了
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setReasonFor(reasonFor === h.id ? null : h.id)
                    setReason('')
                  }}
                >
                  我确实没做
                </button>
              </div>

              {reasonFor === h.id ? (
                <div className="gate-reason">
                  <input
                    className="input"
                    value={reason}
                    autoFocus
                    maxLength={80}
                    placeholder="一句话说明原因，别糊弄自己"
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <button
                    className="btn btn-sm"
                    onClick={submit}
                    disabled={reason.trim().length < 2}
                  >
                    记下原因
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="gate-foot">
          写下原因不会让事情变好，但至少让明天的你知道今天卡在哪。
        </div>
      </div>
    </div>
  )
}
