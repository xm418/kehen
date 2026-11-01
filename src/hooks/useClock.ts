import { useEffect, useState } from 'react'
import { timerRemaining, useStore } from '../state/store'

/** 计时器运行时每秒刷新一次 */
export function useTimerSeconds(): number {
  const { data } = useStore()
  const [, force] = useState(0)
  useEffect(() => {
    if (!data.timer.running) return
    const id = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [data.timer.running])
  return timerRemaining(data.timer)
}

/** 通用定时刷新（用于跨天的日期切换） */
export function useTodayKey(): string {
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 60000)
    return () => clearInterval(id)
  }, [])
  const d = new Date()
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
