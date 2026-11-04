import { registerPlugin } from '@capacitor/core'
import { buildReminderIcs } from './ics'
import { exportToFile } from './storage/localAdapter'
import { isNativeApp } from './nativeNotify'

/** 原生侧：拉起系统日历的新建日程页 */
interface KehenCalendarPlugin {
  insertDailyEvent(options: {
    title: string
    description: string
    hour: number
    durationMinutes?: number
    rrule?: string
  }): Promise<{ begin: number; end: number }>
}

const KehenCalendar = registerPlugin<KehenCalendarPlugin>('KehenCalendar')

export const REMINDER_SUMMARY = '刻痕 · 今天的习惯还没做完'

export function reminderDescription(habitNames: string[]): string {
  const names = habitNames.map((n) => n.trim()).filter(Boolean).join('、')
  return names ? `今天要做的：${names}` : '打开刻痕，看看今天的习惯。'
}

/**
 * 把每日提醒写进系统日历。
 * 安卓：ACTION_INSERT 直接打开日历的新建日程页（.ics 文件在安卓上没人接收，已实测失败）。
 * 网页 / iPhone：仍然下载 .ics，用系统日历打开。
 */
export async function addDailyReminderToCalendar(
  hour: number,
  habitNames: string[],
): Promise<'calendar' | 'file'> {
  if (!isNativeApp()) {
    await exportToFile(buildReminderIcs(hour, habitNames), '刻痕提醒.ics', 'text/calendar')
    return 'file'
  }
  await KehenCalendar.insertDailyEvent({
    title: REMINDER_SUMMARY,
    description: reminderDescription(habitNames),
    hour,
    durationMinutes: 15,
    rrule: 'FREQ=DAILY',
  })
  return 'calendar'
}
