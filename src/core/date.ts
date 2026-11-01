import type { DateKey } from './types'

const pad = (n: number) => (n < 10 ? '0' + n : '' + n)

/** 本地时间转 YYYY-MM-DD */
export function toKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayKey(): DateKey {
  return toKey(new Date())
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = parseKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((parseKey(a).getTime() - parseKey(b).getTime()) / 86400000)
}

/** 周一为一周起点 */
export function startOfWeek(key: DateKey): DateKey {
  const d = parseKey(key)
  const day = d.getDay() // 0=周日
  const offset = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + offset)
  return toKey(d)
}

export function endOfWeek(key: DateKey): DateKey {
  return addDays(startOfWeek(key), 6)
}

/** 生成从 start 到 end 的日期序列 */
export function rangeKeys(start: DateKey, end: DateKey): DateKey[] {
  const out: DateKey[] = []
  let cur = start
  let guard = 0
  while (cur <= end && guard < 4000) {
    out.push(cur)
    cur = addDays(cur, 1)
    guard++
  }
  return out
}

export function lastNDays(n: number, end: DateKey = todayKey()): DateKey[] {
  return rangeKeys(addDays(end, -(n - 1)), end)
}

export function weekdayOf(key: DateKey): number {
  return parseKey(key).getDay()
}

const WEEK_LABEL = ['日', '一', '二', '三', '四', '五', '六']

export function weekdayLabel(key: DateKey): string {
  return WEEK_LABEL[weekdayOf(key)]
}

export function formatShort(key: DateKey): string {
  const d = parseKey(key)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function formatFull(key: DateKey): string {
  const d = parseKey(key)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${weekdayLabel(key)}`
}

export function relativeLabel(key: DateKey): string {
  const delta = diffDays(key, todayKey())
  if (delta === 0) return '今天'
  if (delta === -1) return '昨天'
  if (delta === 1) return '明天'
  if (delta > 0) return `还有 ${delta} 天`
  return `逾期 ${-delta} 天`
}

export function minutesToText(min: number): string {
  if (min <= 0) return '0 分钟'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m} 分钟`
  if (m === 0) return `${h} 小时`
  return `${h} 小时 ${m} 分`
}

export function timeToText(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${pad(m)}:${pad(sec)}`
}

/** 当前时间的分钟数 */
export function nowMinutes(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}
