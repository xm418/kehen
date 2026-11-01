import { useEffect } from 'react'

interface WakeLockLike {
  release: () => Promise<void>
}
interface WakeLockApi {
  request: (type: 'screen') => Promise<WakeLockLike>
}

/** 专注期间保持屏幕常亮；浏览器不支持时静默跳过 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock
    if (!api) return

    let lock: WakeLockLike | null = null
    let disposed = false

    const acquire = async () => {
      try {
        lock = await api.request('screen')
        if (disposed) void lock.release()
      } catch {
        // 低电量模式或被系统拒绝时忽略
      }
    }

    // 切回来要重新申请，锁会在页面隐藏时被系统释放
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [enabled])
}
