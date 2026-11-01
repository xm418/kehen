import { todayKey } from './date'
import type { AppData } from './types'

const PREFIX = 'kedu:snap:'
/** 最多保留几份自动快照 */
const KEEP = 7

export interface SnapshotInfo {
  date: string
  bytes: number
  habits: number
  studyLogs: number
}

function prune() {
  const keys = Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .sort()
  while (keys.length > KEEP) {
    localStorage.removeItem(keys.shift() as string)
  }
}

/**
 * 每天自动存一份快照，作为「某天开始时」的还原点。
 * 同一天只写一次，除非 force 为真。
 */
export function takeSnapshot(data: AppData, force = false): boolean {
  try {
    const key = PREFIX + todayKey()
    if (!force && localStorage.getItem(key)) return false
    localStorage.setItem(key, JSON.stringify(data))
    prune()
    return true
  } catch {
    // 容量不足等情况不影响正常使用
    return false
  }
}

export function listSnapshots(): SnapshotInfo[] {
  const out: SnapshotInfo[] = []
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(PREFIX)) continue
      const raw = localStorage.getItem(key)
      if (!raw) continue
      let habits = 0
      let studyLogs = 0
      try {
        const parsed = JSON.parse(raw) as AppData
        habits = parsed.habits?.length ?? 0
        studyLogs = parsed.studyLogs?.length ?? 0
      } catch {
        /* 损坏的快照仍然列出，让用户自己决定 */
      }
      out.push({ date: key.slice(PREFIX.length), bytes: raw.length, habits, studyLogs })
    }
  } catch {
    /* ignore */
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function readSnapshot(date: string): AppData | null {
  try {
    const raw = localStorage.getItem(PREFIX + date)
    if (!raw) return null
    return JSON.parse(raw) as AppData
  } catch {
    return null
  }
}

export function hasSnapshotToday(): boolean {
  try {
    return localStorage.getItem(PREFIX + todayKey()) !== null
  } catch {
    return false
  }
}
