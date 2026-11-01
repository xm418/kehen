import { registerPlugin } from '@capacitor/core'
import { apiBase, endpointReady, ENDPOINT_HINT } from './storage/cloudAdapter'
import { isNativeApp } from './nativeNotify'

/** 构建时自动从 android/app/build.gradle 读取，不用再手改 */
export const APP_VERSION = __APP_VERSION__

export interface UpdateInfo {
  version: string
  notes: string
  url: string
  size?: number
  releasedAt?: string
}

/** 原生侧：用系统下载器下载，下完自动拉起安装界面 */
interface AppUpdaterPlugin {
  install(options: { url: string; fileName: string }): Promise<{ started: boolean }>
}

const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater')

/** 1 表示 a 更新，-1 表示 b 更新 */
export function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0)
  const pb = b.split('.').map((n) => Number(n) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

/** 服务器上放 server/app/version.json */
export async function fetchLatest(endpoint?: string): Promise<UpdateInfo> {
  if (!endpointReady(endpoint)) throw new Error(ENDPOINT_HINT)
  const res = await fetch(`${apiBase(endpoint)}/app/version`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`服务器没有版本信息（${res.status}）`)
  const info = (await res.json()) as UpdateInfo
  if (!info || !info.version) throw new Error('版本信息格式不对')
  return info
}

/** 相对路径要拼到服务器地址上；地址没填就没法下载 */
export function absoluteUrl(url: string, endpoint?: string): string | null {
  if (/^https?:\/\//i.test(url)) return url
  const base = apiBase(endpoint)
  if (!base.startsWith('http')) return null
  return base.replace(/\/api$/i, '') + url
}

/** 下载并安装：APK 内走系统下载器，网页端退化成浏览器下载 */
export async function installUpdate(info: UpdateInfo, endpoint?: string): Promise<string> {
  const url = absoluteUrl(info.url, endpoint)
  if (!url) throw new Error('先在「账号与同步」里填上服务器地址，才能下载更新')
  if (isNativeApp()) {
    await AppUpdater.install({ url, fileName: `kehen-${info.version}.apk` })
    return '已开始下载，完成后会弹出安装界面'
  }
  window.open(url, '_blank')
  return '已交给浏览器下载'
}
