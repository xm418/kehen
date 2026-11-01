import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { useTodayKey } from '../hooks/useClock'
import { addDays } from '../core/date'
import { isPastDeadline, unexcusedHabits } from '../core/supervision'
import { Icon } from './Icons'

/**
 * 过点后还没给明天写计划就拦住。
 * 「明日计划」是每天必填的一件事，只留「写一条」这条路——
 * 想休息的话也可以，但要在计划里明确写上「明天休息一天」。
 */
export function PlanGate() {
  const { data, ready, actions } = useStore()
  const today = useTodayKey()
  const [now, setNow] = useState(() => new Date())
  const [text, setText] = useState('')

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const cfg = data.settings.supervision
  const tomorrow = addDays(today, 1)
  const hasPlan = (data.plans.find((p) => p.date === tomorrow)?.items.length ?? 0) > 0
  // 习惯拦截层优先：先把今天的习惯处理完，再要求写计划
  const habitGateOpen =
    cfg.intercept && isPastDeadline(cfg.deadlineHour, now) && unexcusedHabits(data, today).length > 0
  const visible = ready && isPastDeadline(cfg.deadlineHour, now) && !hasPlan && !habitGateOpen

  if (!visible) return null

  const save = () => {
    if (!text.trim()) return
    actions.addPlanItem(tomorrow, text, false)
    setText('')
  }

  return (
    <div className="gate-backdrop" role="dialog" aria-modal="true">
      <div className="gate" style={{ maxWidth: 460 }}>
        <div className="gate-head">
          <div className="gate-mark">
            <Icon name="note" size={18} />
          </div>
          <div>
            <div className="eyebrow">今天的最后一件事</div>
            <h2 className="gate-title">给明天写一条计划</h2>
            <div className="card-sub">
              已过 {cfg.deadlineHour}:00 · 每天必填，写一条就能关掉
            </div>
          </div>
        </div>

        <div className="stack" style={{ gap: 10, marginTop: 18 }}>
          <input
            className="input"
            value={text}
            autoFocus
            maxLength={60}
            placeholder="明天最想做成的一件事"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
          />
          <div className="stack" style={{ gap: 8 }}>
            <button className="btn btn-primary" disabled={!text.trim()} onClick={save}>
              写好了
            </button>
            <button className="btn btn-ghost" onClick={() => actions.addPlanItem(tomorrow, '明天休息一天', false)}>
              明天休息一天
            </button>
          </div>
        </div>

        <div className="gate-foot">明天要做的事，今晚就先替自己做一次决定。</div>
      </div>
    </div>
  )
}
