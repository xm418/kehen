import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from './nativeNotify'
import type { GuardCategory } from './types'

/** 原生侧：读手机前台应用（走「使用情况访问」权限） */
interface GuardWatchPlugin {
  hasUsageAccess(): Promise<{ granted: boolean }>
  openSettings(): Promise<void>
  current(): Promise<{ pkg: string; label: string; seconds: number } | null>
}

const GuardWatch = registerPlugin<GuardWatchPlugin>('GuardWatch')

export interface GuardApp {
  pkg: string
  name: string
  category: GuardCategory
}

/** 默认盯住的娱乐应用；按包名精确匹配，系统会换成新版也不影响 */
export const GUARD_APPS: GuardApp[] = [
  { pkg: 'com.ss.android.ugc.aweme', name: '抖音', category: 'video' },
  { pkg: 'com.ss.android.ugc.aweme.lite', name: '抖音极速版', category: 'video' },
  { pkg: 'com.smile.gifmaker', name: '快手', category: 'video' },
  { pkg: 'com.kuaishou.nebula', name: '快手极速版', category: 'video' },
  { pkg: 'com.xingin.xhs', name: '小红书', category: 'video' },
  { pkg: 'tv.danmaku.bili', name: '哔哩哔哩', category: 'video' },
  { pkg: 'com.sina.weibo', name: '微博', category: 'video' },
  { pkg: 'com.qiyi.video', name: '爱奇艺', category: 'video' },
  { pkg: 'com.tencent.qqlive', name: '腾讯视频', category: 'video' },
  { pkg: 'com.youku.phone', name: '优酷', category: 'video' },
  { pkg: 'com.tencent.tmgp.sgame', name: '王者荣耀', category: 'game' },
  { pkg: 'com.tencent.tmgp.pubgmhd', name: '和平精英', category: 'game' },
  { pkg: 'com.tencent.tmgp.cf', name: '穿越火线', category: 'game' },
  { pkg: 'com.tencent.lolm', name: '英雄联盟手游', category: 'game' },
  { pkg: 'com.netease.party', name: '蛋仔派对', category: 'game' },
  { pkg: 'com.miHoYo.Yuanshen', name: '原神', category: 'game' },
  { pkg: 'com.miHoYo.hkrpg', name: '崩坏：星穹铁道', category: 'game' },
  { pkg: 'com.dragon.read', name: '番茄免费小说', category: 'novel' },
  { pkg: 'com.kmxs.reader', name: '七猫免费小说', category: 'novel' },
  { pkg: 'com.qidian.QDReader', name: '起点读书', category: 'novel' },
  { pkg: 'com.tencent.reading', name: 'QQ阅读', category: 'novel' },
  { pkg: 'com.duokan.reader', name: '多看阅读', category: 'novel' },
]

export const GUARD_LABEL: Record<GuardCategory, string> = {
  video: '刷视频',
  game: '打游戏',
  novel: '看小说',
}

export function guardApp(pkg: string): GuardApp | undefined {
  return GUARD_APPS.find((a) => a.pkg === pkg)
}

/** 网页端永远返回 false：手机浏览器读不到别的 App */
export async function usageAccessGranted(): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    const res = await GuardWatch.hasUsageAccess()
    return !!res?.granted
  } catch {
    return false
  }
}

export async function openUsageSettings(): Promise<void> {
  if (!isNativeApp()) return
  try {
    await GuardWatch.openSettings()
  } catch (err) {
    console.error('打开使用情况设置失败', err)
  }
}

/** 当前前台应用；不是 APK、没授权、或就是本应用时返回 null */
export async function readForeground(): Promise<{ pkg: string; label: string; seconds: number } | null> {
  if (!isNativeApp()) return null
  try {
    const res = await GuardWatch.current()
    if (!res || !res.pkg) return null
    return res
  } catch {
    return null
  }
}
