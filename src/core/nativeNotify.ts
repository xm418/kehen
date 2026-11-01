import { Capacitor } from '@capacitor/core'

/** 只在壳里（APK）跑，网页端直接跳过 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

const REMINDER_ID = 1
const CHANNEL_ID = 'kedu-reminder'

/**
 * 每天固定时间的本地提醒。
 * 装成 APK 之后不依赖任何推送服务，系统自己会到点弹通知。
 */
export async function applyDailyReminder(hour: number): Promise<void> {
  if (!isNativeApp()) return
  const { LocalNotifications } = await import('@capacitor/local-notifications')

  try {
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions()
      if (req.display !== 'granted') return
    }

    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: '每日提醒',
      description: '到点提醒今天还没做完的事',
      importance: 4,
      visibility: 1,
    })

    const pending = await LocalNotifications.getPending()
    const old = pending.notifications.filter((n) => n.id === REMINDER_ID)
    if (old.length) {
      await LocalNotifications.cancel({ notifications: old.map((n) => ({ id: n.id })) })
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: REMINDER_ID,
          title: '刻痕 · 今天还没做完',
          body: `已经 ${hour}:00 了，还有习惯没打卡。现在补一下，别让它断。`,
          channelId: CHANNEL_ID,
          schedule: { on: { hour, minute: 0 }, repeats: true, allowWhileIdle: true },
        },
      ],
    })
  } catch (err) {
    console.error('本地提醒设置失败', err)
  }
}

const BACKUP_REMINDER_ID = 2

/**
 * 距离上次导出超过 7 天才提醒一次；刚导出过不会被催。
 * 只调度一条一次性通知，打开 App 时按最新的导出时间重排。
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
      // 从没导出过：下一个周日 20:00
      at.setHours(20, 0, 0, 0)
      at.setDate(at.getDate() + ((7 - at.getDay()) % 7))
      if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 7)
    }
    // 已经逾期：改成明天 20:00，避免一打开 App 就弹
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
 * 专注期间被发现刷视频/打游戏/看小说：立刻弹一条本地通知。
 * 通知 id 固定，连着被抓到只更新这一条，不刷屏。
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
          id: 9001,
          title: '刻痕 · 这段专注破戒了',
          body: `刚刚在${label}（${appName}），已经记一笔。关掉它，回到正在做的事。`,
          channelId: CHANNEL_ID,
        },
      ],
    })
  } catch (err) {
    console.error('破戒提醒发送失败', err)
  }
}
