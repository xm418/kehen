import { addDays, startOfWeek, todayKey, weekdayOf } from './date'
import type { AppData, DateKey, Habit } from './types'

/** 本周（周一为起点）累计完成的次数，用于「每周几次」的习惯 */
function weeklyDone(habit: Habit, data: AppData, today: DateKey): number {
  const start = startOfWeek(today)
  let sum = 0
  for (const l of data.habitLogs) {
    if (l.habitId === habit.id && l.date >= start && l.date <= today) sum += l.count
  }
  return sum
}

/** 从昨天开始往回数，连续断签的「应做日」数量 */
export function habitMissRun(habit: Habit, data: AppData, end: DateKey = todayKey(), limit = 60): number {
  // 「每周几次」不按天考核，不参与断签计算
  if (habit.schedule.type === 'weekly') return 0
  const done = new Map<string, number>()
  for (const l of data.habitLogs) if (l.habitId === habit.id) done.set(l.date, l.count)
  let cur = addDays(end, -1)
  let run = 0
  let guard = 0
  while (cur >= habit.createdAt && guard < limit) {
    if (habit.schedule.type === 'weekdays' && !habit.schedule.days.includes(weekdayOf(cur))) {
      cur = addDays(cur, -1)
      guard++
      continue
    }
    const count = done.get(cur) ?? 0
    if (count >= habit.targetPerDay) break
    run++
    cur = addDays(cur, -1)
    guard++
  }
  return run
}

/** 今天应该做、但还没做完的习惯 */
export function todaysOpenHabits(data: AppData, today: DateKey = todayKey()): Habit[] {
  const day = weekdayOf(today)
  return data.habits.filter((h) => {
    if (h.archived) return false
    if (h.schedule.type === 'weekdays' && !h.schedule.days.includes(day)) return false
    if (h.schedule.type === 'weekly') {
      // 每周几次的习惯只在周日结算一次，避免天天被当成没做
      if (day !== 0) return false
      return weeklyDone(h, data, today) < h.schedule.times
    }
    const count = data.habitLogs.find((l) => l.habitId === h.id && l.date === today)?.count ?? 0
    return count < h.targetPerDay
  })
}

/** 已经过了今日截止时间，且还有没做完的习惯 */
export function isPastDeadline(hour: number, now = new Date()): boolean {
  return now.getHours() >= hour
}

/** 今天还没写原因的习惯（拦截层要展示的对象） */
export function unexcusedHabits(data: AppData, today: DateKey = todayKey()): Habit[] {
  return todaysOpenHabits(data, today).filter(
    (h) => !data.intercepts.some((r) => r.date === today && r.habitId === h.id),
  )
}

export interface DebtSummary {
  total: number
  open: number
  perHabit: { habitId: string; habitName: string; amount: number }[]
}

export function debtSummary(data: AppData): DebtSummary {
  const map = new Map<string, { habitName: string; amount: number }>()
  let total = 0
  let open = 0
  for (const d of data.debts) {
    const left = Math.max(0, d.amount - d.repaid)
    total += d.amount
    open += left
    if (left > 0) {
      const cur = map.get(d.habitId) ?? { habitName: d.habitName, amount: 0 }
      cur.amount += left
      map.set(d.habitId, cur)
    }
  }
  return {
    total,
    open,
    perHabit: [...map.entries()].map(([habitId, v]) => ({ habitId, ...v })),
  }
}

export function activeRemedials(data: AppData) {
  return data.remedials.filter((r) => !r.done)
}

/** 新增习惯是否被锁住：还有补救任务没做完 */
export function isHabitCreationLocked(data: AppData): boolean {
  return data.settings.supervision.lock && activeRemedials(data).length > 0
}

export function debtsForHabit(data: AppData, habitId: string) {
  return data.debts
    .filter((d) => d.habitId === habitId && d.amount - d.repaid > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

/**
 * 每日对账：把漏掉的额度滚成欠账，并为连续断签的习惯生成补救任务。
 * 直接修改传入的 draft（调用方负责克隆），返回是否发生了变化。
 */
export function reconcileSupervision(draft: AppData, today: DateKey = todayKey()): boolean {
  const cfg = draft.settings.supervision
  let changed = false
  const windowStart = addDays(today, -14)

  if (cfg.debt) {
    for (const habit of draft.habits) {
      if (habit.archived || habit.schedule.type === 'weekly') continue
      let cur = windowStart < habit.createdAt ? habit.createdAt : windowStart
      while (cur < today) {
        const scheduled =
          habit.schedule.type !== 'weekdays' || habit.schedule.days.includes(weekdayOf(cur))
        if (scheduled) {
          const count =
            draft.habitLogs.find((l) => l.habitId === habit.id && l.date === cur)?.count ?? 0
          const missing = habit.targetPerDay - count
          const idx = draft.debts.findIndex((d) => d.habitId === habit.id && d.date === cur)
          if (missing > 0) {
            if (idx < 0) {
              draft.debts.push({
                id: `d_${habit.id}_${cur}`,
                habitId: habit.id,
                habitName: habit.name,
                date: cur,
                amount: missing,
                repaid: 0,
                createdAt: new Date().toISOString(),
              })
              changed = true
            } else if (draft.debts[idx].amount !== missing && draft.debts[idx].repaid === 0) {
              draft.debts[idx].amount = missing
              changed = true
            }
          } else if (idx >= 0 && draft.debts[idx].repaid === 0) {
            // 事后补上了这一天，欠账自动消掉
            draft.debts.splice(idx, 1)
            changed = true
          }
        }
        cur = addDays(cur, 1)
      }
    }
  }

  if (cfg.lock) {
    for (const habit of draft.habits) {
      if (habit.archived || habit.schedule.type === 'weekly') continue
      const run = habitMissRun(habit, draft, today)
      if (run < cfg.lockAfterMiss) continue
      const pending = draft.remedials.some((r) => r.habitId === habit.id && !r.done)
      const todayTask = draft.remedials.some((r) => r.habitId === habit.id && r.date === today)
      if (pending || todayTask) continue
      draft.remedials.push({
        id: `r_${habit.id}_${today}`,
        habitId: habit.id,
        habitName: habit.name,
        date: today,
        missedDays: run,
        done: false,
        createdAt: new Date().toISOString(),
      })
      changed = true
    }
  }

  return changed
}

const NOTIFY_KEY = 'kedu:notified:'

/** 每天最多提醒一次，避免反复弹系统通知 */
export function notifyOnce(date: DateKey, title: string, body: string): boolean {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  const key = NOTIFY_KEY + date
  try {
    if (localStorage.getItem(key)) return false
    localStorage.setItem(key, '1')
  } catch {
    return false
  }
  try {
    new Notification(title, { body, tag: 'kedu-overdue' })
    return true
  } catch {
    return false
  }
}
