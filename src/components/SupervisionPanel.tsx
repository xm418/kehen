import { useStore } from '../state/store'
import { useTodayKey } from '../hooks/useClock'
import {
  activeRemedials,
  debtSummary,
  debtsForHabit,
  isHabitCreationLocked,
  unexcusedHabits,
} from '../core/supervision'
import { formatShort } from '../core/date'

/** 欠账与补救：把「没做到」变成看得见的账，而不是悄悄归零 */
export function SupervisionPanel({ compact = false }: { compact?: boolean }) {
  const { data, actions } = useStore()
  const today = useTodayKey()
  const debts = debtSummary(data)
  const remedials = activeRemedials(data)
  const locked = isHabitCreationLocked(data)
  const pending = unexcusedHabits(data, today)

  if (debts.open === 0 && remedials.length === 0) return null

  const critical = debts.open >= 5

  return (
    <div className="stack" style={{ marginBottom: 14 }}>
      {remedials.length > 0 ? (
        <section className={`card warn${locked ? ' strong' : ''}`}>
          <div className="warn-head">
            <div>
              <div className="eyebrow" style={{ color: 'var(--danger)' }}>
                断签 {remedials[0].missedDays} 天
              </div>
              <h3 className="card-title" style={{ marginTop: 4 }}>
                先完成补救，才能新增习惯
              </h3>
              <div className="card-sub">
                {remedials.map((r) => r.habitName).join('、')} 已经连续断了，补一次再往前走。
              </div>
            </div>
          </div>
          <div className="stack" style={{ gap: 8, marginTop: 10 }}>
            {remedials.map((r) => (
              <div className="row-between" key={r.id}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 550 }}>{r.habitName}</div>
                  <div className="card-sub">连续 {r.missedDays} 天没做 · {formatShort(r.date)} 触发</div>
                </div>
                <button className="btn btn-sm" onClick={() => actions.completeRemedial(r.id)}>
                  我今天补做一次
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {debts.open > 0 ? (
        <section className={`card warn${critical ? ' strong' : ''}`}>
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="eyebrow" style={{ color: critical ? 'var(--danger)' : 'var(--muted)' }}>
                {critical ? '欠账过多' : '欠账'}
              </div>
              <h3 className="card-title" style={{ marginTop: 4 }}>
                还欠 {debts.open} 次没补
              </h3>
              <div className="card-sub">
                {critical
                  ? '欠得太多，先把最老的一笔补掉，别再开新习惯。'
                  : '按天没做完的部分累积，可以在这几天补回来。'}
              </div>
            </div>
            <span className="num" style={{ fontSize: 22, color: critical ? 'var(--danger)' : 'var(--text)' }}>
              {debts.open}
            </span>
          </div>

          {!compact ? (
            <div className="stack" style={{ gap: 8, marginTop: 12 }}>
              {debts.perHabit.map((item) => {
                const first = debtsForHabit(data, item.habitId)[0]
                if (!first) return null
                return (
                  <div className="row-between" key={item.habitId}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 550 }}>{item.habitName}</div>
                      <div className="card-sub">
                        欠 {item.amount} 次 · 最早 {formatShort(first.date)}
                      </div>
                    </div>
                    <button className="btn btn-sm" onClick={() => actions.repayDebt(first.id)}>
                      补回 1 次
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      {pending.length > 0 ? (
        <div className="warn-line">
          <span className="dot-live" />
          今天还有 {pending.length} 件事没做，过了截止时间会被强制记原因。
        </div>
      ) : null}
    </div>
  )
}
