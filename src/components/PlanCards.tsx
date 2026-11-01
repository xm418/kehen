import { useState } from 'react'
import { useStore } from '../state/store'
import { useTodayKey } from '../hooks/useClock'
import { addDays, formatShort } from '../core/date'
import { Icon } from './Icons'

/** 今天照着做的清单：昨天写好的，加上今天临时补的 */
export function TodayPlanCard({ onFocus }: { onFocus?: () => void }) {
  const { data, actions } = useStore()
  const today = useTodayKey()
  const [text, setText] = useState('')

  const items = data.plans.find((p) => p.date === today)?.items ?? []
  const doneCount = items.filter((i) => i.done).length

  const add = () => {
    actions.addPlanItem(today, text, true)
    setText('')
  }

  return (
    <section className="card plan-card">
      <div className="card-head">
        <div>
          <div className="eyebrow">今天</div>
          <h3 className="card-title">今天要做的事</h3>
          <div className="card-sub">
            {items.length === 0
              ? '昨天没写计划，先补一条临时计划也行'
              : `已经完成 ${doneCount} / ${items.length} 条`}
          </div>
        </div>
        {items.length > 0 ? (
          <span className="num muted" style={{ fontSize: 12 }}>
            {doneCount}/{items.length}
          </span>
        ) : null}
      </div>

      {items.map((item) => (
        <div className="plan-row" key={item.id}>
          <button
            className={`habit-tick${item.done ? ' on' : ''}`}
            onClick={() => actions.togglePlanItem(today, item.id)}
            aria-label={`完成 ${item.text}`}
          >
            <Icon name="check" size={15} />
          </button>
          <span className={`plan-text${item.done ? ' done' : ''}`}>{item.text}</span>
          {item.temp ? <span className="plan-temp">临时</span> : null}
          {item.goalId ? <span className="plan-temp">目标</span> : null}
          {!item.done && onFocus ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                actions.setTimerPlan(item.id, item.text)
                onFocus()
              }}
            >
              去专注
            </button>
          ) : null}
          <button className="btn btn-ghost btn-sm" onClick={() => actions.removePlanItem(today, item.id)}>
            删
          </button>
        </div>
      ))}

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <input
          className="input"
          value={text}
          placeholder="临时想到的事，今天也能加上"
          maxLength={60}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button className="btn btn-sm" onClick={add} disabled={!text.trim()}>
          加一条
        </button>
      </div>
    </section>
  )
}

/** 晚上给明天写计划：每天必填，第二天自动变成「今天要做的事」 */
export function TomorrowPlanCard() {
  const { data, actions } = useStore()
  const today = useTodayKey()
  const tomorrow = addDays(today, 1)
  const [text, setText] = useState('')

  const items = data.plans.find((p) => p.date === tomorrow)?.items ?? []
  const todayOpen = (data.plans.find((p) => p.date === today)?.items ?? []).filter(
    (i) => !i.done && !items.some((t) => t.text === i.text),
  )

  const add = () => {
    actions.addPlanItem(tomorrow, text, false)
    setText('')
  }

  const carryOver = () => {
    for (const item of todayOpen) actions.addPlanItem(tomorrow, item.text, false)
  }

  return (
    <section className="card plan-card" style={{ marginTop: 12 }}>
      <div className="card-head">
        <div>
          <div className="eyebrow">睡前</div>
          <h3 className="card-title">明天要做什么</h3>
          <div className="card-sub">
            {formatShort(tomorrow)} · 今晚写下，明天照着做
          </div>
        </div>
        <span className={`plan-required${items.length > 0 ? ' ok' : ''}`}>
          {items.length > 0 ? `已写 ${items.length} 条` : '今天必填'}
        </span>
      </div>

      {items.map((item) => (
        <div className="plan-row" key={item.id}>
          <span className="plan-bullet" />
          <span className="plan-text">{item.text}</span>
          {item.goalId ? <span className="plan-temp">目标</span> : null}
          <button className="btn btn-ghost btn-sm" onClick={() => actions.removePlanItem(tomorrow, item.id)}>
            删
          </button>
        </div>
      ))}

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <input
          className="input"
          value={text}
          placeholder="明天最想做成的一件事"
          maxLength={60}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button className="btn btn-sm" onClick={add} disabled={!text.trim()}>
          加一条
        </button>
      </div>
      {todayOpen.length > 0 ? (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={carryOver}>
          沿用今天没做完的 {todayOpen.length} 条
        </button>
      ) : null}
      <div className="card-sub" style={{ marginTop: 10 }}>
        只写一条也算完成。写太多，明天一定做不完。
      </div>
    </section>
  )
}
