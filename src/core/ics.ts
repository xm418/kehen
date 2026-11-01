import { addDays, todayKey } from './date'

const pad = (n: number) => (n < 10 ? '0' + n : '' + n)

/** iOS / 安卓日历都支持浮动时间（不带 Z），会按手机当前时区解释 */
function localStamp(key: string, hour: number): string {
  return `${key.replace(/-/g, '')}T${pad(hour)}0000`
}

function utcStamp(now: Date): string {
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  )
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** 按 RFC 5545 的 75 字节上限折行，避免中文把行撑爆 */
function fold(line: string): string {
  const encoder = new TextEncoder()
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const size = encoder.encode(ch).length
    if (bytes + size > 73) {
      out.push(cur)
      cur = ' '
      bytes = 1
    }
    cur += ch
    bytes += size
  }
  out.push(cur)
  return out.join('\r\n')
}

/**
 * 生成一份可导入系统日历的提醒文件。
 * 事件每天在截止时间前重复，即使根本不打开这个应用，手机也会提醒。
 */
export function buildReminderIcs(hour: number, habitNames: string[]): string {
  const now = new Date()
  // 今天这个点已经过了，就从明天开始，避免导出一条已经过期的事件
  const start = now.getHours() >= hour ? addDays(todayKey(), 1) : todayKey()
  const names = habitNames.map((n) => n.trim()).filter(Boolean).join('、')
  const desc = names ? `今天要做的：${names}` : '打开刻痕，看看今天的习惯。'
  const summary = '刻痕 · 今天的习惯还没做完'

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kehen//Daily Reminder//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:刻痕提醒',
    'BEGIN:VEVENT',
    `UID:kedu-reminder-${hour}@local`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${localStamp(start, hour)}`,
    'DURATION:PT15M',
    'RRULE:FREQ=DAILY',
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(desc)}`,
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(`${summary}：${desc}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.map(fold).join('\r\n') + '\r\n'
}
