import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from './nativeNotify'

/** 原生侧：设置状态栏和手势条颜色 */
interface SystemBarsPlugin {
  apply(options: { dark: boolean }): Promise<void>
}

const SystemBars = registerPlugin<SystemBarsPlugin>('SystemBars')

/** 只在 APK 里生效；网页端交给浏览器自己的 theme-color */
export async function applySystemBars(dark: boolean): Promise<void> {
  if (!isNativeApp()) return
  try {
    await SystemBars.apply({ dark })
  } catch (err) {
    console.error('设置系统栏颜色失败', err)
  }
}
