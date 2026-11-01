import type { ReactNode } from 'react'
import { addDays, startOfWeek, todayKey } from '../core/date'
import type { DateKey } from '../core/types'

/** 环形进度 */
export function Ring({
  value,
  size = 62,
  stroke = 3,
  children,
}: {
  value: number
  size?: number
  stroke?: number
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={stroke}
          strokeDasharray={`${c * v} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      {children ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            fontSize: 12,
            fontFamily: 'var(--mono)',
            color: 'var(--text-2)',
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

/** 年/月级热力图，按周排列 */
export function Heatmap({
  values,
  weeks = 20,
  end = todayKey(),
}: {
  values: { key: DateKey; ratio: number }[]
  weeks?: number
  end?: DateKey
}) {
  const map = new Map(values.map((v) => [v.key, v.ratio]))
  const first = addDays(startOfWeek(end), -(weeks - 1) * 7)

  const columns: DateKey[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: DateKey[] = []
    for (let d = 0; d < 7; d++) col.push(addDays(first, w * 7 + d))
    columns.push(col)
  }

  return (
    <div className="heatmap">
      {columns.map((col) => (
        <div className="heat-col" key={col[0]}>
          {col.map((key) => {
            const future = key > end
            const ratio = map.get(key) ?? 0
            const level = future
              ? 0
              : ratio <= 0
                ? 0
                : ratio < 0.34
                  ? 1
                  : ratio < 0.67
                    ? 2
                    : ratio < 1
                      ? 3
                      : 4
            return (
              <div
                key={key}
                className={`heat-cell l${level}`}
                title={`${key}${future ? '' : ` · ${Math.round(ratio * 100)}%`}`}
                style={future ? { opacity: 0.25 } : undefined}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** 横向条形对比 */
export function BarList({
  items,
  unit = '分钟',
  emptyText = '还没有数据',
}: {
  items: { name: string; value: number }[]
  unit?: string
  emptyText?: string
}) {
  if (items.length === 0) return <div className="empty">{emptyText}</div>
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {items.map((i) => (
        <div className="bar-row" key={i.name}>
          <span className="bar-label">{i.name}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(i.value / max) * 100}%` }} />
          </span>
          <span className="bar-value">
            {i.value}
            {unit}
          </span>
        </div>
      ))}
    </div>
  )
}

/** 最近 N 天柱状趋势 */
export function SparkBars({
  items,
  showAxis = true,
  height = 56,
}: {
  items: { key: DateKey; value: number; label: string }[]
  showAxis?: boolean
  height?: number
}) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <>
      <div className="spark" style={{ height }}>
        {items.map((i, idx) => (
          <div
            key={i.key}
            className={`spark-bar${idx === items.length - 1 ? ' today' : ''}`}
            style={{ height: `${Math.max(3, (i.value / max) * 100)}%` }}
            title={`${i.key} · ${i.value}`}
          />
        ))}
      </div>
      {showAxis ? (
        <div className="spark-axis">
          {items.map((i) => (
            <span key={i.key}>{i.label}</span>
          ))}
        </div>
      ) : null}
    </>
  )
}

/** 自评分数小点 */
export function ScoreDots({ scores }: { scores: (number | null)[] }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      {scores.map((s, i) => (
        <div
          key={i}
          title={s ? `${s} 分` : '未自评'}
          style={{
            flex: 1,
            height: 26,
            borderRadius: 6,
            background: s ? `color-mix(in srgb, var(--ink) ${s * 18}%, var(--surface-3))` : 'var(--surface-3)',
            border: '1px solid var(--border-strong)',
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: s && s >= 4 ? 'var(--on-ink)' : 'var(--muted)',
          }}
        >
          {s ?? ''}
        </div>
      ))}
    </div>
  )
}
