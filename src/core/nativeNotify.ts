import { Capacitor } from '@capacitor/core'
import { parseKey, toKey, weekdayLabel } from './date'
import { debtSummary, todaysOpenHabits } from './supervision'
import type { AppData, DateKey } from './types'

/** 只在 APK 里跑，网页端跳过 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

const CHANNEL_ID = 'kedu-reminder'
/** 专注结束即时提醒：importance 5 + 震动 + 系统铃声 */
const FOCUS_CHANNEL_ID = 'kedu-focus-done'

/**
 * 通知 id 分段：
 *   10000 - 19999  = 每日提醒 schedule 槽位（按日偏移 0-6 × 每天 slot 数）
 *   9001           = 破戒即时提醒
 *   2              = 备份提醒
 * 先 cancel 全段再重建，避免重复。
 */
const REMINDER_ID_BASE = 10000
const REMINDER_ID_END = 20000
const BACKUP_REMINDER_ID = 2
const GUARD_REMINDER_ID = 9001

// ---------- 每天的几个提醒时间点 ----------
interface Slot {
  hour: number
  minute: number
  /** 生成这一条的正文。返回 null 表示今天这条不发（例如睡前没欠账就不催） */
  make: (data: AppData, date: DateKey) => { title: string; body: string } | null
}

function listOpenHabits(data: AppData, date: DateKey, max = 5): string {
  const open = todaysOpenHabits(data, date)
  if (open.length === 0) return ''
  const shown = open.slice(0, max).map((h) => h.name)
  const more = open.length - shown.length
  let text = shown.join('、')
  if (more > 0) text += ` 等 ${open.length} 个`
  return text
}

function listPlans(data: AppData, date: DateKey, max = 5): string {
  const plan = data.plans.find((p) => p.date === date)
  if (!plan) return ''
  const open = plan.items.filter((i) => !i.done)
  if (open.length === 0) return ''
  const shown = open.slice(0, max).map((i) => i.text)
  const more = open.length - shown.length
  let text = shown.join('、')
  if (more > 0) text += ` 等 ${open.length} 项`
  return text
}

function listDebts(data: AppData, max = 4): string {
  const d = debtSummary(data)
  if (d.open === 0) return ''
  const shown = d.perHabit.slice(0, max).map((h) => `${h.habitName}×${h.amount}`)
  const more = d.perHabit.length - shown.length
  let text = shown.join('，')
  if (more > 0) text += ` 等 ${d.open} 笔`
  return text
}

function listRemedials(data: AppData, max = 4): string {
  const open = data.remedials.filter((r) => !r.done)
  if (open.length === 0) return ''
  const shown = open.slice(0, max).map((r) => `${r.habitName} 断签 ${r.missedDays} 天`)
  return shown.join('，')
}

function makeSlots(deadlineHour: number): Slot[] {
  return [
    // slot 0: 早上 8:30 — 今日清单
    {
      hour: 8,
      minute: 30,
      make: (data, date) => {
        const allActive = data.habits.filter((h) => {
          if (h.archived) return false
          if (h.schedule.type === 'weekdays') {
            const day = parseKey(date).getDay()
            return h.schedule.days.includes(day)
          }
          return true
        })
        const planText = listPlans(data, date)
        const habitText = allActive.length
          ? allActive.slice(0, 5).map((h) => h.name).join('、') +
            (allActive.length > 5 ? ` 等 ${allActive.length} 个习惯` : '')
          : ''
        if (!habitText && !planText) return null
        const wd = weekdayLabel(date)
        const title = `刻痕 · 今天（周${wd}）`
        let body = ''
        if (habitText) body = `今日习惯：${habitText}`
        if (planText) body += (body ? '；' : '') + `计划：${planText}`
        body += '。刻刻盯着呢。'
        return { title, body }
      },
    },
    // slot 1: 中午 13:00 — 简短催一催
    {
      hour: 13,
      minute: 0,
      make: (data, date) => {
        const open = listOpenHabits(data, date, 3)
        if (!open) {
          // 上午就全清了，夸一下
          return { title: '刻痕 · 上午全清 🎉', body: '好习惯保持住。下午别让它翻车。' }
        }
        return { title: '刻痕 · 别躺平了', body: `今天还欠：${open}。` }
      },
    },
    // slot 2: 截止时间 — 盘点今天没做完的
    {
      hour: deadlineHour,
      minute: 0,
      make: (data, date) => {
        const open = listOpenHabits(data, date, 5)
        const plan = listPlans(data, date, 3)
        if (!open && !plan) {
          return { title: '刻痕 · 今天全做完了 ✨', body: '没有漏项，今天是胜利。' }
        }
        let body = ''
        if (open) body = `还没做完的习惯：${open}`
        if (plan) body += (body ? '；' : '') + `计划未完成：${plan}`
        return { title: '刻痕 · 到点了，盘点一下', body: body + '。' }
      },
    },
    // slot 3: 睡前 22:30 — 复盘 + 欠账
    {
      hour: 22,
      minute: 30,
      make: (data, date) => {
        const open = listOpenHabits(data, date, 3)
        const debts = listDebts(data, 3)
        const rems = listRemedials(data, 2)
        if (!open && !debts && !rems) return null // 没欠账，不打扰
        let body = ''
        if (open) body += `今日未完成：${open}。`
        if (debts) body += ` 欠账：${debts}。`
        if (rems) body += ` 补救任务：${rems}。`
        return { title: '刻痕 · 睡前复盘', body: body + '。明天一起还。' }
      },
    },
  ]
}

// ---------- 核心：schedule 未来 N 天所有提醒 ----------

/**
 * 先清理旧的（id 10000-20000），再 schedule 未来 `daysAhead` 天的所有 slot。
 * 每次 App 启动 / 设置变更都可以调用，幂等。
 */
export async function scheduleAllReminders(
  data: AppData,
  daysAhead = 7,
): Promise<void> {
  if (!isNativeApp()) return
  const { LocalNotifications } = await import('@capacitor/local-notifications')

  try {
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions()
      if (req.display !== 'granted') return
    }

    // 先确保 channel 存在
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: '每日提醒',
      description: '刻痕每天的任务盘点和催促',
      importance: 4,
      visibility: 1,
    })

    // 清理 id 段：先查 pending 再 cancel，避免无效调用
    const pending = await LocalNotifications.getPending()
    const toCancel = pending.notifications.filter(
      (n) => typeof n.id === 'number' && n.id >= REMINDER_ID_BASE && n.id < REMINDER_ID_END,
    )
    if (toCancel.length > 0) {
      await LocalNotifications.cancel({ notifications: toCancel.map((n) => ({ id: n.id })) })
    }

    // 构建 schedule
    const slots = makeSlots(data.settings.supervision.deadlineHour || 21)
    const notifications: {
      id: number
      title: string
      body: string
      channelId: string
      schedule: { at: Date; allowWhileIdle: boolean }
    }[] = []

    const now = new Date()
    for (let offset = 0; offset < daysAhead; offset++) {
      const date = new Date()
      date.setDate(date.getDate() + offset)
      const dk = toKey(date)

      for (const slot of slots) {
        // deadlineHour 为 0 表示用户关掉了截止提醒
        if (offset === 0 && slot.hour === data.settings.supervision.deadlineHour && slot.hour === 0) continue
        const payload = slot.make(data, dk)
        if (!payload) continue

        const at = new Date(date)
        at.setHours(slot.hour, slot.minute, 0, 0)
        // 已过的时间点，跳到明天
        if (at.getTime() <= now.getTime()) continue

        const id = REMINDER_ID_BASE + offset * 10 + slots.indexOf(slot)
        notifications.push({
          id,
          title: payload.title,
          body: payload.body,
          channelId: CHANNEL_ID,
          schedule: { at, allowWhileIdle: true },
        })
      }
    }

    if (notifications.length === 0) return
    await LocalNotifications.schedule({ notifications })
  } catch (err) {
    console.error('scheduleAllReminders failed', err)
  }
}

// ---------- 旧接口保留，但内部改走同一个 channel ----------

const OLD_REMINDER_ID = 1 // 兼容之前留下的旧 id，下次 scheduleAllReminders 会清理掉

/**
 * 老接口：每天固定时间重复提醒。
 * 现在改走 scheduleAllReminders（它会覆盖所有旧 id），留空壳避免外部调用崩。
 */
export async function applyDailyReminder(hour: number): Promise<void> {
  // 调用方现在应该用 scheduleAllReminders(data) 来替代
  // 这里仅保留一条"兜底"的 repeats 提醒（当用户完全没打开 App 时保底）
  if (!isNativeApp()) return
  if (!hour || hour < 1 || hour > 23) return
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: '每日提醒',
      description: '刻痕每天的任务盘点和催促',
      importance: 4,
      visibility: 1,
    })
    await LocalNotifications.schedule({
      notifications: [
        {
          id: OLD_REMINDER_ID,
          title: '刻痕 · 到点了',
          body: `已经 ${hour}:00，打开 App 看看今天还有什么没做完。`,
          channelId: CHANNEL_ID,
          schedule: { on: { hour, minute: 0 }, repeats: true, allowWhileIdle: true },
        },
      ],
    })
  } catch (err) {
    console.error('applyDailyReminder failed', err)
  }
}

/**
 * 7 天没导出就提醒一次；刚导出过就往后顺。
 * 这条独立通道，不被 scheduleAllReminders 清理。
 */
export async function applyBackupReminder(enabled: boolean, lastExportedAt?: string): Promise<void> {
  if (!isNativeApp()) return
  const { LocalNotifications } = await import('@capacitor/local-notifications')

  try {
    const pending = await LocalNotifications.getPending()
    const old = pending.notifications.filter((n) => n.id === BACKUP_REMINDER_ID)
    if (old.length) {
      await LocalNotifications.cancel({ notifications: old.map((n) => ({ id: n.id })) })
    }
    if (!enabled) return

    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') return

    const at = new Date()
    const last = lastExportedAt ? new Date(lastExportedAt) : null
    if (last && !Number.isNaN(last.getTime())) {
      at.setTime(last.getTime() + 7 * 24 * 60 * 60 * 1000)
      at.setHours(20, 0, 0, 0)
    } else {
      at.setHours(20, 0, 0, 0)
      at.setDate(at.getDate() + ((7 - at.getDay()) % 7))
      if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 7)
    }
    if (at.getTime() <= Date.now()) {
      const t = new Date()
      t.setDate(t.getDate() + 1)
      t.setHours(20, 0, 0, 0)
      at.setTime(t.getTime())
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: BACKUP_REMINDER_ID,
          title: '刻痕 · 该备份了',
          body: '数据只存在这台设备，卸载或清数据就找不回来。设置 → 数据与备份 → 导出全部（JSON）。',
          channelId: CHANNEL_ID,
          schedule: { at, allowWhileIdle: true },
        },
      ],
    })
  } catch (err) {
    console.error('备份提醒设置失败', err)
  }
}

/**
 * 专注期被抓到刷视频/打游戏/看小说：立刻弹一条。
 */
export async function notifyGuardHit(appName: string, label: string): Promise<void> {
  if (!isNativeApp()) return
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  try {
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') return
    await LocalNotifications.schedule({
      notifications: [
        {
          id: GUARD_REMINDER_ID,
          title: '刻刻 · 破戒了 😤',
          body: `刚刚在${label}（${appName}），我看到了。关掉它，回来。`,
          channelId: CHANNEL_ID,
        },
      ],
    })
  } catch (err) {
    console.error('破戒提醒发送失败', err)
  }
}

const FOCUS_DONE_ID = 9100

/**
 * 专注段结束即时提醒：震动 + 系统默认铃声 + 通知横幅。
 * App 在前台也弹（Android 上 Capacitor LocalNotifications 前台照样弹）。
 * @param minutes 实际完成分钟数
 * @param subject 专注的主题（可为空）
 * @param nextMode 下一段是短休息还是长休息，用来决定文案
 */
export async function notifyFocusDone(
  minutes: number,
  subject?: string,
  nextMode: 'shortBreak' | 'longBreak' = 'shortBreak',
): Promise<void> {
  if (!isNativeApp()) return
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  try {
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') return

    // 确保高优先级 channel 存在（importance 5 = 紧急 + 锁屏也弹 + 默认震动 + 铃声）
    await LocalNotifications.createChannel({
      id: FOCUS_CHANNEL_ID,
      name: '专注结束',
      description: '一段专注完成时提醒你',
      importance: 5,
      visibility: 1,
      sound: 'default',
    })

    // 先取消上次还没滑掉的，避免重复
    const pending = await LocalNotifications.getPending()
    const old = pending.notifications.filter((n) => n.id === FOCUS_DONE_ID)
    if (old.length) {
      await LocalNotifications.cancel({ notifications: old.map((n) => ({ id: n.id })) })
    }

    const title = '🎉 专注完成！'
    const body = subject
      ? `${minutes} 分钟 · ${subject} · ${nextMode === 'longBreak' ? '长休一下' : '休息会儿再来'}`
      : `${minutes} 分钟 · ${nextMode === 'longBreak' ? '长休一下' : '休息会儿再来'}`

    await LocalNotifications.schedule({
      notifications: [
        {
          id: FOCUS_DONE_ID,
          title,
          body,
          channelId: FOCUS_CHANNEL_ID,
          sound: 'default',
        },
      ],
    })
  } catch (err) {
    // 静默失败：通知权限被关、channel 创建失败等都别让主流程崩
    console.warn('notifyFocusDone failed', err)
  }
}
