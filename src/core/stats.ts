import { addDays, diffDays, startOfWeek, todayKey, weekdayOf, rangeKeys } from './date'
import type { AppData, DailyPlan, DateKey, FocusSession, Habit, HabitLog, StudyLog } from './types'
import type { Achievement } from './types'

/** 一段专注中途离开到几次，就不再算「完整番茄」 */
export const CLEAN_INTERRUPTIONS = 2

export function isCleanSession(session: FocusSession): boolean {
  return (session.interruptions ?? 0) < CLEAN_INTERRUPTIONS
}

export interface Streak {
  current: number
  longest: number
}

export function isHabitScheduled(habit: Habit, key: DateKey): boolean {
  if (habit.schedule.type === 'daily') return true
  if (habit.schedule.type === 'weekdays') return habit.schedule.days.includes(weekdayOf(key))
  // 「每周几次」没有固定哪天，只在周日做一次结算，否则每天都被当成欠一次
  return weekdayOf(key) === 0
}

export function habitCountOn(logs: HabitLog[], habitId: string, key: DateKey): number {
  const found = logs.find((l) => l.habitId === habitId && l.date === key)
  return found ? found.count : 0
}

export function isHabitDone(habit: Habit, logs: HabitLog[], key: DateKey): boolean {
  return habitCountOn(logs, habit.id, key) >= habit.targetPerDay
}

export function habitRatio(habit: Habit, logs: HabitLog[], key: DateKey): number {
  if (habit.targetPerDay <= 0) return 0
  return Math.min(1, habitCountOn(logs, habit.id, key) / habit.targetPerDay)
}

/** 连续达成天数（周计划按周计算）；补录的打卡不算，避免虚高的连续天数 */
export function habitStreak(habit: Habit, logs: HabitLog[], end: DateKey = todayKey()): Streak {
  const done = new Map<string, number>()
  for (const l of logs) if (l.habitId === habit.id && !l.backfill) done.set(l.date, l.count)
  const isDone = (k: DateKey) => (done.get(k) ?? 0) >= habit.targetPerDay

  if (habit.schedule.type === 'weekly') {
    const times = habit.schedule.times
    const weekDone = (weekStart: DateKey) => {
      let total = 0
      for (let i = 0; i < 7; i++) total += done.get(addDays(weekStart, i)) ?? 0
      return total >= times
    }
    let wk = startOfWeek(end)
    if (!weekDone(wk)) wk = addDays(wk, -7)
    let current = 0
    while (weekDone(wk) && current < 300) {
      current++
      wk = addDays(wk, -7)
    }
    let longest = 0
    let run = 0
    let cur = startOfWeek(habit.createdAt)
    const endWk = startOfWeek(end)
    let guard = 0
    while (cur <= endWk && guard < 600) {
      if (weekDone(cur)) {
        run++
        longest = Math.max(longest, run)
      } else run = 0
      cur = addDays(cur, 7)
      guard++
    }
    return { current, longest: Math.max(longest, current) }
  }

  // 今日尚未打卡时，从昨天开始算，避免 streak 提前归零
  let cur = end
  if (isHabitScheduled(habit, end) && !isDone(end)) cur = addDays(end, -1)
  let current = 0
  let guard = 0
  while (guard < 1000) {
    if (!isHabitScheduled(habit, cur)) {
      cur = addDays(cur, -1)
      guard++
      continue
    }
    if (isDone(cur)) {
      current++
      cur = addDays(cur, -1)
      guard++
    } else break
  }

  let longest = 0
  let run = 0
  let walk = habit.createdAt < end ? habit.createdAt : end
  // 只看最近 1000 天；之前算出的 start 没接到 walk 上，长历史习惯会从创建日白走一遍
  if (diffDays(end, walk) > 1000) walk = addDays(end, -1000)
  let steps = 0
  while (walk <= end && steps < 1200) {
    if (isHabitScheduled(habit, walk)) {
      if (isDone(walk)) {
        run++
        longest = Math.max(longest, run)
      } else run = 0
    }
    walk = addDays(walk, 1)
    steps++
  }
  return { current, longest: Math.max(longest, current) }
}

/** 某天需要打卡的习惯数量与已完成数量 */
export function habitDayProgress(habits: Habit[], logs: HabitLog[], key: DateKey) {
  const active = habits.filter((h) => !h.archived && isHabitScheduled(h, key))
  const done = active.filter((h) => isHabitDone(h, logs, key))
  return { active, done, total: active.length, doneCount: done.length }
}

export function sessionDate(startedAt: string): DateKey {
  const d = new Date(startedAt)
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function focusMinutesOn(sessions: AppData['sessions'], key: DateKey): number {
  return sessions
    .filter((s) => s.mode === 'focus' && sessionDate(s.startedAt) === key)
    .reduce((sum, s) => sum + s.minutes, 0)
}

export function studyMinutesOn(logs: StudyLog[], key: DateKey): number {
  return logs.filter((l) => l.date === key).reduce((sum, l) => sum + l.minutes, 0)
}

export function focusByDay(sessions: AppData['sessions'], end: DateKey, days = 7) {
  return rangeKeys(addDays(end, -(days - 1)), end).map((key) => ({
    key,
    minutes: focusMinutesOn(sessions, key),
  }))
}

/** 科目分布 */
export function subjectBreakdown(logs: StudyLog[], end: DateKey, days = 30) {
  const start = addDays(end, -(days - 1))
  const buckets = new Map<string, number>()
  for (const l of logs) {
    if (l.date < start || l.date > end) continue
    const name = l.subject.trim() || '未分类'
    buckets.set(name, (buckets.get(name) ?? 0) + l.minutes)
  }
  return [...buckets.entries()]
    .map(([name, minutes]) => ({ name, minutes }))
    .sort((a, b) => b.minutes - a.minutes)
}

/** 今日到期需要复习的条目 */
export function dueReviews(logs: StudyLog[], today: DateKey = todayKey()): StudyLog[] {
  return logs
    .filter((l) => l.nextReviewAt && l.nextReviewAt <= today)
    .sort((a, b) => (a.nextReviewAt! < b.nextReviewAt! ? -1 : 1))
}

/** 某段日期里计划条目的完成情况；只统计真正写下计划的日子 */
export function planProgress(plans: DailyPlan[], start: DateKey, end: DateKey) {
  let done = 0
  let total = 0
  let days = 0
  for (const p of plans) {
    if (p.date < start || p.date > end || p.items.length === 0) continue
    days++
    total += p.items.length
    done += p.items.filter((i) => i.done).length
  }
  return { done, total, days, rate: total === 0 ? 0 : done / total }
}

/** 某个目标从计划里被推进了几条（只算勾掉的） */
export function planDoneForGoal(plans: DailyPlan[], goalId: string, start: DateKey, end: DateKey): number {
  return plans
    .filter((p) => p.date >= start && p.date <= end)
    .reduce((n, p) => n + p.items.filter((i) => i.goalId === goalId && i.done).length, 0)
}

/** 最近 N 天每天的计划完成率，用来画趋势 */
export function planByDay(plans: DailyPlan[], end: DateKey, days = 14) {
  return rangeKeys(addDays(end, -(days - 1)), end).map((key) => {
    const items = plans.find((p) => p.date === key)?.items ?? []
    const done = items.filter((i) => i.done).length
    return { key, done, total: items.length, rate: items.length === 0 ? 0 : done / items.length }
  })
}

export interface WeekMetrics {
  weekStart: DateKey
  weekEnd: DateKey
  habitDone: number
  habitTotal: number
  habitRate: number
  planDone: number
  planTotal: number
  planRate: number
  planDays: number
  focusMinutes: number
  focusSessions: number
  studyMinutes: number
  studyCount: number
  reviewCount: number
  dailyScores: { key: DateKey; score: number | null }[]
  avgScore: number | null
  topSubjects: { name: string; minutes: number }[]
  notes: string[]
}

export function weekMetrics(data: AppData, weekStart: DateKey): WeekMetrics {
  const weekEnd = addDays(weekStart, 6)
  const days = rangeKeys(weekStart, weekEnd)

  let habitDone = 0
  let habitTotal = 0
  for (const key of days) {
    const p = habitDayProgress(data.habits, data.habitLogs, key)
    habitTotal += p.total
    habitDone += p.doneCount
  }

  const focusSessions = data.sessions.filter(
    (s) => s.mode === 'focus' && sessionDate(s.startedAt) >= weekStart && sessionDate(s.startedAt) <= weekEnd,
  )
  const focusMinutes = focusSessions.reduce((a, s) => a + s.minutes, 0)

  const weekLogs = data.studyLogs.filter((l) => l.date >= weekStart && l.date <= weekEnd)
  const studyMinutes = weekLogs.reduce((a, l) => a + l.minutes, 0)
  const reviewCount = data.studyLogs.filter(
    (l) => l.lastReviewedAt && l.lastReviewedAt >= weekStart && l.lastReviewedAt <= weekEnd,
  ).length

  const dailyScores = days.map((key) => ({
    key,
    score: data.dailyReviews.find((r) => r.date === key)?.score ?? null,
  }))
  const scored = dailyScores.filter((d) => d.score !== null) as { key: DateKey; score: number }[]
  const avgScore = scored.length ? scored.reduce((a, d) => a + d.score, 0) / scored.length : null

  const topSubjects = subjectBreakdown(data.studyLogs, weekEnd, 7).slice(0, 4)
  const plan = planProgress(data.plans, weekStart, weekEnd)

  const notes: string[] = []
  if (habitRateOf(habitDone, habitTotal) < 0.6 && habitTotal > 0) notes.push('习惯完成率偏低，建议把昨天没做的习惯砍掉或改小目标。')
  if (plan.total > 0 && plan.rate < 0.6) notes.push('每天写的计划完成不到六成，明天少写两条，先保证能做完。')
  if (focusMinutes < 180) notes.push('本周专注时长不足 3 小时，先保证每天一个完整的番茄。')
  if (reviewCount === 0 && data.studyLogs.length > 0) notes.push('本周没有复习任何旧内容，记忆会持续衰减。')
  if (avgScore !== null && avgScore < 3) notes.push('每日自评分均值偏低，可能需要降低当日目标数量。')
  if (notes.length === 0) notes.push('整体节奏稳定，可以试着把某个习惯的强度再提一档。')

  return {
    weekStart,
    weekEnd,
    habitDone,
    habitTotal,
    habitRate: habitRateOf(habitDone, habitTotal),
    planDone: plan.done,
    planTotal: plan.total,
    planRate: plan.rate,
    planDays: plan.days,
    focusMinutes,
    focusSessions: focusSessions.length,
    studyMinutes,
    studyCount: weekLogs.length,
    reviewCount,
    dailyScores,
    avgScore,
    topSubjects,
    notes,
  }
}

export function habitRateOf(done: number, total: number): number {
  return total === 0 ? 0 : done / total
}

export interface MonthMetrics {
  monthStart: DateKey
  monthEnd: DateKey
  habitDone: number
  habitTotal: number
  habitRate: number
  bestName: string | null
  bestCurrent: number
  bestLongest: number
  planDone: number
  planTotal: number
  planRate: number
  focusMinutes: number
  studyCount: number
  studyMinutes: number
  /** 本月补录的打卡次数，单独展示，不混进连续天数 */
  backfillCount: number
  newHabits: number
}

/** 本月成绩单 */
export function monthMetrics(data: AppData, end: DateKey = todayKey()): MonthMetrics {
  const monthStart = `${end.slice(0, 7)}-01`
  const days = rangeKeys(monthStart, end)

  let habitDone = 0
  let habitTotal = 0
  for (const key of days) {
    const p = habitDayProgress(data.habits, data.habitLogs, key)
    habitDone += p.doneCount
    habitTotal += p.total
  }

  let bestName: string | null = null
  let bestCurrent = 0
  let bestLongest = 0
  for (const habit of data.habits) {
    if (habit.archived) continue
    const s = habitStreak(habit, data.habitLogs, end)
    if (s.current > bestCurrent) {
      bestCurrent = s.current
      bestName = habit.name
    }
    if (s.longest > bestLongest) bestLongest = s.longest
  }

  const monthSessions = data.sessions.filter((s) => {
    const key = sessionDate(s.startedAt)
    return s.mode === 'focus' && key >= monthStart && key <= end
  })
  const monthLogs = data.studyLogs.filter((l) => l.date >= monthStart && l.date <= end)
  const plan = planProgress(data.plans, monthStart, end)

  return {
    monthStart,
    monthEnd: end,
    habitDone,
    habitTotal,
    habitRate: habitRateOf(habitDone, habitTotal),
    bestName,
    bestCurrent,
    bestLongest,
    planDone: plan.done,
    planTotal: plan.total,
    planRate: plan.rate,
    focusMinutes: monthSessions.reduce((a, s) => a + s.minutes, 0),
    studyCount: monthLogs.length,
    studyMinutes: monthLogs.reduce((a, l) => a + l.minutes, 0),
    backfillCount: data.habitLogs.filter((l) => l.backfill && l.date >= monthStart && l.date <= end).length,
    newHabits: data.habits.filter((h) => h.createdAt >= monthStart && h.createdAt <= end).length,
  }
}

/* =================== 以下为第三轮优化：弹性统计 / 关联分析 / 成就系统 =================== */

/** 习惯「弹性恢复率」（学 Keel）：最近 4 次断签后，几天内补回的比例
 *  ≥80%：韧性强；40-80%：稳步提升；<40%：容易放弃
 *  断签定义：某天该做且没完成。补回定义：断签后 2 天内（含补录）完成一次
 */
export function habitResilience(
  habit: Habit,
  logs: HabitLog[],
  end: DateKey = todayKey(),
): { rate: number; totalMisses: number; recovered: number; label: string } {
  const done = new Map<string, number>()
  for (const l of logs) if (l.habitId === habit.id) done.set(l.date, l.count)
  const isDone = (k: DateKey) => (done.get(k) ?? 0) >= habit.targetPerDay

  // 找最近 100 天的断签点（只看创建之后的、非归档的、排了的日子）
  const misses: DateKey[] = []
  const walkStart = habit.createdAt > addDays(end, -100) ? habit.createdAt : addDays(end, -100)
  let cur = walkStart
  while (cur <= end && diffDays(end, cur) < 101) {
    if (isHabitScheduled(habit, cur) && !isDone(cur)) {
      // 补录的不算「真错过」
      const log = logs.find((l) => l.habitId === habit.id && l.date === cur)
      if (!log?.backfill) misses.push(cur)
    }
    cur = addDays(cur, 1)
  }

  // 取最近 4 次断签，看每次之后 2 天内有没有补回
  const recent = misses.slice(-4)
  let recovered = 0
  for (const missDay of recent) {
    let found = false
    for (let i = 1; i <= 2; i++) {
      const nk = addDays(missDay, i)
      // 补录也算恢复
      const backfill = logs.find(
        (l) => l.habitId === habit.id && l.date === nk && l.backfill,
      )
      if (isDone(nk) || backfill) {
        found = true
        break
      }
    }
    if (found) recovered++
  }
  const rate = recent.length === 0 ? 1 : Math.round((recovered / recent.length) * 100)
  const label = rate >= 80 ? '韧性强' : rate >= 40 ? '稳步提升' : '需要加固'
  return { rate, totalMisses: misses.length, recovered, label }
}

/** 皮尔逊相关系数（简化版，用于两个数字数组的关联） */
function pearson(x: number[], y: number[]): number | null {
  const n = x.length
  if (n < 5) return null
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx
    const b = y[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

/** 生活模式关联洞察（学 Way of Life / tr8ck）：看数据之间的隐藏关系 */
export interface CorrelationInsight {
  type: 'habit-vs-focus' | 'day-of-week' | 'habit-vs-score' | 'word-vs-focus'
  text: string
  strength?: number // 相关系数或差异倍数
}

export function correlationAnalysis(data: AppData, windowDays = 60): CorrelationInsight[] {
  const insights: CorrelationInsight[] = []
  const end = todayKey()
  const days = rangeKeys(addDays(end, -(windowDays - 1)), end)
  const activeHabits = data.habits.filter((h) => !h.archived)

  if (activeHabits.length >= 1) {
    // 专注 vs 习惯完成率：每天专注段数 vs 当天习惯完成率
    const focusBuckets: Record<'heavy' | 'light' | 'none', { done: number; total: number }> = {
      heavy: { done: 0, total: 0 },
      light: { done: 0, total: 0 },
      none: { done: 0, total: 0 },
    }
    for (const key of days) {
      const focus = focusMinutesOn(data.sessions, key)
      const p = habitDayProgress(activeHabits, data.habitLogs, key)
      const bucket = focus >= 60 ? 'heavy' : focus > 0 ? 'light' : 'none'
      focusBuckets[bucket].done += p.doneCount
      focusBuckets[bucket].total += p.total
    }
    const rate = (b: { done: number; total: number }) => (b.total === 0 ? 0 : b.done / b.total)
    if (focusBuckets.heavy.total >= 10 && focusBuckets.none.total >= 10) {
      const diff = (rate(focusBuckets.heavy) - rate(focusBuckets.none)) * 100
      if (diff > 10) {
        insights.push({
          type: 'habit-vs-focus',
          text: `有专注的日子，习惯完成率比没专注的高 ${Math.round(diff)}%——专注是自律的放大器`,
          strength: Math.round(diff),
        })
      } else if (diff < -10) {
        insights.push({
          type: 'habit-vs-focus',
          text: `有专注的日子反而完成率低 ${Math.round(-diff)}%——可能同时做了太多事`,
          strength: Math.round(diff),
        })
      }
    }

    // 周几效应：哪天完成率最高/最低
    const byDow = new Map<number, { done: number; total: number }>()
    for (const key of days) {
      const p = habitDayProgress(activeHabits, data.habitLogs, key)
      const dow = weekdayOf(key)
      const cur = byDow.get(dow) ?? { done: 0, total: 0 }
      cur.done += p.doneCount
      cur.total += p.total
      byDow.set(dow, cur)
    }
    const dowRates = [...byDow.entries()]
      .map(([dow, v]) => ({ dow, rate: v.total === 0 ? 0 : v.done / v.total }))
      .sort((a, b) => b.rate - a.rate)
    if (dowRates.length >= 5) {
      const best = dowRates[0]
      const worst = dowRates[dowRates.length - 1]
      const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      if (best.rate - worst.rate > 0.25) {
        insights.push({
          type: 'day-of-week',
          text: `${names[best.dow]}效率最高（${Math.round(best.rate * 100)}%），${names[worst.dow]}只有 ${Math.round(worst.rate * 100)}%——可以把难习惯放到高效率那天`,
          strength: Math.round((best.rate - worst.rate) * 100),
        })
      }
    }
  }

  // 专注 vs 学词量 相关系数
  const focusX: number[] = []
  const wordY: number[] = []
  const wordMap = new Map(data.wordHistory.map((h) => [h.date, h.count]))
  for (const key of days) {
    const fm = focusMinutesOn(data.sessions, key)
    const wc = wordMap.get(key) ?? 0
    if (fm > 0 || wc > 0) {
      focusX.push(fm)
      wordY.push(wc)
    }
  }
  const r = pearson(focusX, wordY)
  if (r !== null && Math.abs(r) > 0.4 && focusX.length >= 14) {
    insights.push({
      type: 'word-vs-focus',
      text:
        r > 0
          ? `专注时长和学词量正相关 (r=${r.toFixed(2)})——沉下心的日子学的也多`
          : `专注时长和学词量反而负相关 (r=${r.toFixed(2)})——两类活动在抢你的精力`,
      strength: Math.round(r * 100),
    })
  }

  // 专注 vs 每日评分
  const scoreX: number[] = []
  const scoreY: number[] = []
  const reviewMap = new Map(data.dailyReviews.map((r) => [r.date, r.score]))
  for (const key of days) {
    const review = reviewMap.get(key)
    if (review !== undefined) {
      scoreX.push(focusMinutesOn(data.sessions, key))
      scoreY.push(review)
    }
  }
  const rs = pearson(scoreX, scoreY)
  if (rs !== null && Math.abs(rs) > 0.35 && scoreX.length >= 7) {
    insights.push({
      type: 'habit-vs-score',
      text:
        rs > 0
          ? `专注多的日子自评分更高 (r=${rs.toFixed(2)})——专注让你觉得这一天没白过`
          : `专注多的日子自评反而更低 (r=${rs.toFixed(2)})——也许太贪多了`,
      strength: Math.round(rs * 100),
    })
  }

  return insights.slice(0, 4)
}

/* =================== 成就徽章系统 =================== */

export interface AchievementDef extends Achievement {
  /** check(data) 返回 true 就解锁 */
  check: (data: AppData) => boolean
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_focus',
    title: '第一次沉下心',
    icon: '🌱',
    desc: '完成第一段专注',
    check: (d) => d.sessions.some((s) => s.mode === 'focus' && s.minutes >= 5),
  },
  {
    id: 'streak_14',
    title: '两周不歇',
    icon: '🔥',
    desc: '任一习惯连续打卡 14 天',
    check: (d) =>
      d.habits.some((h) => {
        const s = habitStreak(h, d.habitLogs)
        return s.current >= 14 || s.longest >= 14
      }),
  },
  {
    id: 'streak_30',
    title: '整月不熄',
    icon: '✨',
    desc: '任一习惯连续打卡 30 天',
    check: (d) =>
      d.habits.some((h) => {
        const s = habitStreak(h, d.habitLogs)
        return s.current >= 30 || s.longest >= 30
      }),
  },
  {
    id: 'focus_50h',
    title: '森林里种了一片树',
    icon: '🌲',
    desc: '累计专注 50 小时',
    check: (d) =>
      d.sessions.filter((s) => s.mode === 'focus').reduce((a, s) => a + s.minutes, 0) >= 50 * 60,
  },
  {
    id: 'focus_200h',
    title: '深耕不辍',
    icon: '🏔️',
    desc: '累计专注 200 小时',
    check: (d) =>
      d.sessions.filter((s) => s.mode === 'focus').reduce((a, s) => a + s.minutes, 0) >= 200 * 60,
  },
  {
    id: 'words_100',
    title: '百词斩',
    icon: '📖',
    desc: '学完 100 个单词（stage ≥ 6 掌握）',
    check: (d) => d.words.filter((w) => w.stage >= 6 || w.familiar === 1).length >= 100,
  },
  {
    id: 'words_300',
    title: '英语自由行',
    icon: '🎓',
    desc: '掌握 300 个单词',
    check: (d) => d.words.filter((w) => w.stage >= 6 || w.familiar === 1).length >= 300,
  },
  {
    id: 'debts_repaid',
    title: '不怕跌倒',
    icon: '💪',
    desc: '累计补回 5 次欠账',
    check: (d) => d.debts.filter((x) => x.repaid >= x.amount).length >= 5,
  },
  {
    id: 'weekly_review_4',
    title: '每周一省',
    icon: '📝',
    desc: '连续写 4 周周复盘',
    check: (d) => d.weeklyReviews.length >= 4,
  },
  {
    id: 'budget_kept',
    title: '量入为出',
    icon: '💰',
    desc: '单月支出未超预算',
    check: (d) => {
      const budget = d.settings.bills.monthlyBudget
      if (budget <= 0) return false
      const now = todayKey()
      const start = `${now.slice(0, 7)}-01`
      const total = d.expenses
        .filter((e) => e.type === 'expense' && e.date >= start && e.date <= now)
        .reduce((a, e) => a + e.amount, 0)
      return total <= budget
    },
  },
  {
    id: 'goal_done',
    title: '命中目标',
    icon: '🎯',
    desc: '完成第一个目标',
    check: (d) => d.goals.some((g) => g.status === 'done'),
  },
  {
    id: 'resilience',
    title: '越挫越勇',
    icon: '🛡️',
    desc: '任一习惯恢复率 ≥ 80%',
    check: (d) =>
      d.habits
        .filter((h) => !h.archived)
        .some((h) => habitResilience(h, d.habitLogs).rate >= 80),
  },
]

/** 检查新解锁的成就，返回 id 列表；已经解锁过的不重复返回 */
export function checkAchievements(data: AppData): string[] {
  const existing = new Set(data.achievements ?? [])
  const newly: string[] = []
  for (const a of ACHIEVEMENTS) {
    if (!existing.has(a.id) && a.check(data)) newly.push(a.id)
  }
  return newly
}

/** 按 id 查成就定义 */
export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id)
}

/* =================== 第四轮优化：健康度 / 专注连击 / 今日建议 / 扭蛋 =================== */

/**
 * 习惯健康度（学 HabitFlow / Habit Beaver）：
 * 最近 14 天 EWMA 加权（越近权重越高），一次失误掉 10 分、补录回 5 分、休息日不掉分。
 * 永远不归零——哪怕连续几天没做，分数只是慢慢往下飘，不会一夜清零。
 */
export function habitHealthScore(
  habit: Habit,
  logs: HabitLog[],
  end: DateKey = todayKey(),
): { score: number; trend: 'up' | 'down' | 'flat' } {
  const isDone = (k: DateKey) => {
    const log = logs.find((l) => l.habitId === habit.id && l.date === k)
    if (!log) return false
    if (log.restDay) return true // 休息日跳过，不算完成也不算失误
    return log.count >= habit.targetPerDay
  }
  const isRest = (k: DateKey) =>
    logs.some((l) => l.habitId === habit.id && l.date === k && l.restDay)

  // 先算近 7 天，再算近 14 天，看趋势
  const calc = (days: number) => {
    let score = 100
    const d0 = addDays(end, -(days - 1))
    let cur = d0
    let w = 1
    while (cur <= end) {
      // 今天还没排到或正在进行中不扣分
      if (cur === end && isHabitScheduled(habit, cur) && !isDone(cur) && !isRest(cur)) {
        // 今天未打卡：如果当前还没到习惯"通常打卡时间"就别提前扣
        // 简化：今天默认跳过，等明天再结算
        cur = addDays(cur, 1)
        continue
      }
      if (isHabitScheduled(habit, cur)) {
        if (isRest(cur)) {
          // 休息日：不扣分、不加满分，分数不动
        } else if (isDone(cur)) {
          score = Math.min(100, score + 3 * w)
        } else {
          // 补录回来的：掉得少
          const log = logs.find((l) => l.habitId === habit.id && l.date === cur)
          score = Math.max(0, log?.backfill ? score - 5 * w : score - 10 * w)
        }
      }
      cur = addDays(cur, 1)
      w *= 0.85 // 越近权重越高（指数衰减）
    }
    return Math.round(score)
  }

  const s7 = calc(7)
  const s14 = calc(14)
  const trend: 'up' | 'down' | 'flat' = s7 - s14 > 8 ? 'up' : s14 - s7 > 8 ? 'down' : 'flat'
  return { score: s7, trend }
}

/** 专注日连胜：连续几天每天都有至少一段专注（≥10min） */
export function focusStreakToday(sessions: AppData['sessions'], end: DateKey = todayKey()): number {
  const focusDays = new Set<string>()
  for (const s of sessions) {
    if (s.mode === 'focus' && s.minutes >= 10) focusDays.add(sessionDate(s.startedAt))
  }
  let streak = 0
  let cur = end
  // 今天还没专注时从昨天开始算
  if (!focusDays.has(cur)) cur = addDays(cur, -1)
  while (focusDays.has(cur) && streak < 500) {
    streak++
    cur = addDays(cur, -1)
  }
  return streak
}

/** 专注日连胜（含今天）：今天已经开始了那今天算第几天 */
export function focusStreakIncludingToday(
  sessions: AppData['sessions'],
  end: DateKey = todayKey(),
): { streak: number; todayQualified: boolean } {
  const focusDays = new Set<string>()
  for (const s of sessions) {
    if (s.mode === 'focus' && s.minutes >= 10) focusDays.add(sessionDate(s.startedAt))
  }
  const todayQualified = focusDays.has(end)
  let streak = todayQualified ? 0 : 0
  let cur = todayQualified ? end : addDays(end, -1)
  while (focusDays.has(cur) && streak < 500) {
    streak++
    cur = addDays(cur, -1)
  }
  return { streak, todayQualified }
}

/* =================== 专注扭蛋 =================== */

export interface GachaItem {
  id: string
  emoji: string
  name: string
  rarity: 'common' | 'rare' | 'epic'
  desc: string
}

export const GACHA_POOL: GachaItem[] = [
  // 普通（约 75%）
  { id: 'c1', emoji: '🌱', name: '刚发芽的小苗', rarity: 'common', desc: '每一段专注都是在给它浇水' },
  { id: 'c2', emoji: '🪴', name: '迷你多肉', rarity: 'common', desc: '好养活，像你也一样坚韧' },
  { id: 'c3', emoji: '🐣', name: '刚出壳的小鸡', rarity: 'common', desc: '啄一下，就能前进一小步' },
  { id: 'c4', emoji: '🍀', name: '四叶草叶子', rarity: 'common', desc: '找到一片好运草' },
  { id: 'c5', emoji: '✏️', name: '削好的铅笔', rarity: 'common', desc: '随时准备写第一笔' },
  { id: 'c6', emoji: '📜', name: '一页草稿纸', rarity: 'common', desc: '别追求完美，先动笔' },
  { id: 'c7', emoji: '🫖', name: '温热的茶', rarity: 'common', desc: '休息一下也是进步' },
  { id: 'c8', emoji: '🌾', name: '一株麦子', rarity: 'common', desc: '25 分钟 = 一颗种子' },
  { id: 'c9', emoji: '🐌', name: '慢悠悠的蜗牛', rarity: 'common', desc: '它爬得慢，但从不停步' },
  { id: 'c10', emoji: '🔦', name: '手电筒', rarity: 'common', desc: '照亮你现在要做的事' },
  // 稀有（约 20%）
  { id: 'r1', emoji: '🦋', name: '刚化茧的蝴蝶', rarity: 'rare', desc: '你专注的样子真好看' },
  { id: 'r2', emoji: '🐦', name: '知更鸟', rarity: 'rare', desc: '早起的鸟儿，有专注的奖赏' },
  { id: 'r3', emoji: '🌙', name: '弯月书签', rarity: 'rare', desc: '今晚也值得你努力' },
  { id: 'r4', emoji: '📯', name: '号角', rarity: 'rare', desc: '你又多一段连续专注' },
  { id: 'r5', emoji: '🗝️', name: '铜钥匙', rarity: 'rare', desc: '打开下一个专注周期' },
  { id: 'r6', emoji: '🎐', name: '风铃', rarity: 'rare', desc: '提醒你再做一个番茄' },
  // 史诗（约 5%）
  { id: 'e1', emoji: '🌲', name: '参天大树', rarity: 'epic', desc: '100 段专注养出来的树' },
  { id: 'e2', emoji: '🏆', name: '小奖杯', rarity: 'epic', desc: '今天你真的很棒' },
  { id: 'e3', emoji: '🐉', name: '小云朵', rarity: 'epic', desc: '专注久了，心就像云一样轻' },
]

export function drawGacha(): GachaItem {
  const r = Math.random()
  const rarity = r < 0.75 ? 'common' : r < 0.95 ? 'rare' : 'epic'
  const pool = GACHA_POOL.filter((g) => g.rarity === rarity)
  return pool[Math.floor(Math.random() * pool.length)]
}

/* =================== 今日行动建议（规则化 AI 教练） =================== */

export interface ActionAdvice {
  emoji: string
  text: string
  priority: number // 越大越重要，排前面
}

/**
 * 基于当前数据状态，生成 1-3 条今日行动建议。不依赖 LLM，纯规则。
 * 每条建议检查一次，避免同时弹太多条。
 */
export function buildDailyAdvice(data: AppData, today: DateKey): ActionAdvice[] {
  const tips: ActionAdvice[] = []
  const activeHabits = data.habits.filter((h) => !h.archived)
  const progress = habitDayProgress(activeHabits, data.habitLogs, today)
  const focusMin = focusMinutesOn(data.sessions, today)
  const hour = new Date().getHours()
  const correlation = correlationAnalysis(data, 60)

  // 建议 1：按"你的高效时段 + 专注有正关联"优先推专注
  const focusBoost = correlation.find((c) => c.type === 'habit-vs-focus')
  if (focusBoost && focusBoost.strength && focusBoost.strength > 10 && focusMin === 0) {
    tips.push({
      emoji: '🎯',
      text: `有专注的日子你能多完成 ${focusBoost.strength}% 的事——趁现在开第一个番茄`,
      priority: 50,
    })
  } else if (hour < 14 && hour >= 8 && focusMin === 0 && progress.total > 0) {
    tips.push({
      emoji: '🌅',
      text: '上午效率最高，先完成一段专注再看手机',
      priority: 45,
    })
  }

  // 建议 2：习惯方面的小推
  if (progress.total > 0 && progress.doneCount === 0 && hour >= 10) {
    // 找健康度最低的那个习惯
    const weakest = [...activeHabits]
      .map((h) => ({ h, score: habitHealthScore(h, data.habitLogs, today).score }))
      .sort((a, b) => a.score - b.score)[0]
    if (weakest && weakest.score < 70) {
      tips.push({
        emoji: '🪴',
        text: `「${weakest.h.name}」健康度只剩 ${weakest.score}%——今天就做一个最小版本的，别让它继续掉`,
        priority: 40,
      })
    }
  }

  // 建议 3：单词
  const dueWords = data.words.filter(
    (w) => w.familiar === 0 && (!w.nextReviewAt || w.nextReviewAt <= today),
  ).length
  if (dueWords > 15 && data.wordProgress.date !== today) {
    tips.push({
      emoji: '📚',
      text: `有 ${dueWords} 个单词到期了，花 10 分钟就能干掉一批`,
      priority: 35,
    })
  }

  // 建议 4：账单临近预算
  const budget = data.settings.bills.monthlyBudget
  if (budget > 0) {
    const start = `${today.slice(0, 7)}-01`
    const spent = data.expenses
      .filter((e) => e.type === 'expense' && e.date >= start && e.date <= today)
      .reduce((a, e) => a + e.amount, 0)
    if (spent >= budget * 0.9) {
      tips.push({
        emoji: '💰',
        text: `本月已花 ¥${Math.round(spent)}，离预算 ¥${budget} 只剩 ¥${Math.round(budget - spent)}——今天记账再决定`,
        priority: 42,
      })
    }
  }

  // 建议 5：周报已经到时间了
  const weekStart = addDays(startOfWeek(today), 0)
  const alreadyReviewed = data.weeklyReviews.some((r) => r.weekStart === weekStart)
  if (!alreadyReviewed && weekdayOf(today) >= 5) {
    tips.push({
      emoji: '📝',
      text: '这周末到了，花 5 分钟写本周复盘，下周才能更稳',
      priority: 30,
    })
  }

  tips.sort((a, b) => b.priority - a.priority)
  return tips.slice(0, 3)
}

/** 专注结束时的连击 / 里程碑奖励文案 */
export function focusMilestoneMessage(
  sessions: AppData['sessions'],
  today: DateKey,
): { title: string; bonus: string } | null {
  const { streak } = focusStreakIncludingToday(sessions, today)
  const totalFocusHours = sessions
    .filter((s) => s.mode === 'focus')
    .reduce((a, s) => a + s.minutes, 0) / 60

  const milestones = [
    { check: () => streak === 1, title: '今天的第 1 段！', bonus: '开个好头就赢了一半' },
    { check: () => streak === 2, title: '第 2 段完成！', bonus: '节奏已经找到' },
    { check: () => streak === 3, title: '第 3 段！', bonus: '今天的状态不错，+30 专注 XP' },
    { check: () => streak === 5, title: '今日 5 连达成！', bonus: '你今天真的很棒——+100 XP' },
    { check: () => streak === 7, title: '连续 7 天每天都专注了！', bonus: '节奏养成了，继续保持' },
    { check: () => totalFocusHours >= 50, title: '累计专注 50 小时达成！', bonus: '解锁「森林里种了一片树」' },
    { check: () => totalFocusHours >= 100, title: '累计 100 小时了', bonus: '你已经在专注里成为自己' },
  ]

  for (const m of milestones) {
    if (m.check()) return { title: m.title, bonus: m.bonus }
  }
  return null
}
