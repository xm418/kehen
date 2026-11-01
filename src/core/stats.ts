import { addDays, diffDays, startOfWeek, todayKey, weekdayOf, rangeKeys } from './date'
import type { AppData, DailyPlan, DateKey, FocusSession, Habit, HabitLog, StudyLog } from './types'

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
  let start = walk
  if (diffDays(end, start) > 1000) start = addDays(end, -1000)
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
