import { useMemo } from 'react'
import { Sheet } from './Sheet'
import { BarList, Ring, SparkBars } from './Charts'
import { useStore } from '../state/store'
import { useTodayKey } from '../hooks/useClock'
import { addDays, formatShort, lastNDays } from '../core/date'
import { habitDayProgress } from '../core/stats'
import { MASTER_STAGE } from '../core/sm2'

/**
 * 学习统计：一屏看全
 * 连续学习天数、近 14 天学词量、本周/近 30 天新学与复习、打卡完成率、词库掌握结构。
 */
export function WordStatsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useStore()
  const today = useTodayKey()

  const stats = useMemo(() => {
    const byDate = new Map((data.wordHistory ?? []).map((h) => [h.date, h]))
    const sumRange = (days: string[]) => {
      let count = 0
      let newCount = 0
      let reviewCount = 0
      for (const k of days) {
        const h = byDate.get(k)
        if (!h) continue
        count += h.count
        newCount += h.newCount
        reviewCount += h.reviewCount
      }
      return { count, newCount, reviewCount }
    }
    const weekDays = lastNDays(7, today)
    const monthDays = lastNDays(30, today)
    const week = sumRange(weekDays)
    const month = sumRange(monthDays)

    // 连续学习天数：今天还没学时从昨天开始数
    let streak = 0
    let cur = (byDate.get(today)?.count ?? 0) > 0 ? today : addDays(today, -1)
    while ((byDate.get(cur)?.count ?? 0) > 0 && streak < 1000) {
      streak++
      cur = addDays(cur, -1)
    }

    // 打卡完成率：应打卡的习惯里实际完成的比例
    const habitRate = (days: string[]) => {
      let done = 0
      let total = 0
      for (const k of days) {
        const p = habitDayProgress(data.habits, data.habitLogs, k)
        done += p.doneCount
        total += p.total
      }
      return total === 0 ? 0 : done / total
    }

    // 词库结构
    const words = data.words
    const familiar = words.filter((w) => w.familiar === 1).length
    const learning = words.filter((w) => w.familiar === 0 && w.stage > 0).length
    const fresh = words.length - familiar - learning
    const wrong = words.filter((w) => w.wrong).length

    return {
      week,
      month,
      streak,
      weekHabitRate: habitRate(weekDays),
      monthHabitRate: habitRate(monthDays),
      familiar,
      learning,
      fresh,
      wrong,
      total: words.length,
    }
  }, [data, today])

  const bars = useMemo(() => {
    const byDate = new Map((data.wordHistory ?? []).map((h) => [h.date, h]))
    return lastNDays(14, today).map((key) => ({
      key,
      value: byDate.get(key)?.count ?? 0,
      label: `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`,
    }))
  }, [data.wordHistory, today])

  const mastery = stats.total > 0 ? stats.familiar / stats.total : 0

  return (
    <Sheet open={open} title="学习统计" subtitle={`截至 ${formatShort(today)} · 连续 ${MASTER_STAGE} 轮答对算掌握`} onClose={onClose}>
      <div className="stack">
        <div className="card">
          <div className="row-between" style={{ alignItems: 'center' }}>
            <div>
              <div className="num" style={{ fontSize: 26, fontWeight: 650 }}>
                {stats.streak}
              </div>
              <div className="card-sub">连续学习（天）</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="num" style={{ fontSize: 26, fontWeight: 650 }}>
                {stats.week.count}
              </div>
              <div className="card-sub">本周学词</div>
            </div>
            <Ring value={mastery} size={56} stroke={4}>
              {Math.round(mastery * 100)}%
            </Ring>
          </div>
          <div className="card-sub" style={{ marginTop: 8 }}>
            词库 {stats.total} 词 · 掌握度见右侧圆环
          </div>
        </div>

        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            近 14 天学词量
          </div>
          <SparkBars items={bars} />
        </div>

        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            周 / 月对比
          </div>
          <div className="row-between" style={{ fontSize: 13 }}>
            <span className="muted" style={{ width: 64 }} />
            <span className="muted">本周</span>
            <span className="muted">近 30 天</span>
          </div>
          <div className="row-between" style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
            <span style={{ width: 64 }}>新学</span>
            <span className="num">{stats.week.newCount}</span>
            <span className="num">{stats.month.newCount}</span>
          </div>
          <div className="row-between" style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
            <span style={{ width: 64 }}>复习</span>
            <span className="num">{stats.week.reviewCount}</span>
            <span className="num">{stats.month.reviewCount}</span>
          </div>
          <div className="row-between" style={{ padding: '10px 0 0', borderTop: '1px solid var(--border)', alignItems: 'center' }}>
            <span style={{ width: 64, fontSize: 13 }}>打卡完成率</span>
            <Ring value={stats.weekHabitRate} size={40} stroke={3}>
              {Math.round(stats.weekHabitRate * 100)}%
            </Ring>
            <Ring value={stats.monthHabitRate} size={40} stroke={3}>
              {Math.round(stats.monthHabitRate * 100)}%
            </Ring>
          </div>
        </div>

        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            词库结构
          </div>
          <BarList
            unit="词"
            emptyText="词库还是空的"
            items={[
              { name: '已掌握', value: stats.familiar },
              { name: '学习中', value: stats.learning },
              { name: '新词', value: stats.fresh },
              { name: '错词本', value: stats.wrong },
            ]}
          />
        </div>
      </div>
    </Sheet>
  )
}
