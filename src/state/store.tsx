import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createLocalAdapter } from '../core/storage/localAdapter'
import { takeSnapshot } from '../core/backup'
import {
  authLogin,
  authRegister,
  fileDelete,
  fileDownload,
  fileUpload,
  syncPull,
  syncPush,
} from '../core/storage/cloudAdapter'
import {
  blobToBase64,
  deleteLocalBlob,
  openDocument,
  readLocalBlob,
  saveLocalBlob,
} from '../core/files'
import { isHabitCreationLocked, reconcileSupervision } from '../core/supervision'
import { createInitialData, normalizeData, PLAN_KEEP_DAYS, REVIEW_INTERVALS } from '../core/store-model'
import { sm2Rate } from '../core/sm2'
import { checkAchievements } from '../core/stats'
import { drawGacha } from '../core/stats'
import { notifyFocusDone } from '../core/nativeNotify'
import { addDays, todayKey } from '../core/date'
import { uid } from '../core/id'
import type {
  AppData,
  DailyPlan,
  DailyReview,
  DateKey,
  DocumentMeta,
  Expense,
  ExpenseType,
  FocusSession,
  Goal,
  GuardCategory,
  Habit,
  Settings,
  StudyLog,
  TimerMode,
  TimerState,
  WordItem,
} from '../core/types'

export interface NewHabitInput {
  name: string
  targetPerDay: number
  schedule: Habit['schedule']
  note?: string
  preferredSlot?: Habit['preferredSlot']
}

export interface NewStudyInput {
  title: string
  subject: string
  minutes: number
  content: string
  tags: string[]
  date?: DateKey
}

export interface NewGoalInput {
  title: string
  horizon: Goal['horizon']
  dueDate: DateKey
}

export interface NewExpenseInput {
  amount: number
  type: ExpenseType
  category: string
  note?: string
  date?: DateKey
}

export interface StoreActions {
  toggleHabit: (habitId: string, date?: DateKey) => void
  stepHabit: (habitId: string, delta: number, date?: DateKey) => void
  /** 直接设定某天的完成次数，用于补录（过去的日期会自动标记为补录） */
  setHabitCount: (habitId: string, date: DateKey, count: number) => void
  addHabit: (input: NewHabitInput) => void
  updateHabit: (id: string, patch: Partial<Habit>) => void
  setHabitArchived: (id: string, archived: boolean) => void
  removeHabit: (id: string) => void
  /** 标记 / 取消标记休息日：既不算完成也不算断签 */
  toggleRestDay: (habitId: string, date: DateKey) => void

  startTimer: (mode: TimerMode, plannedSeconds: number, subject?: string) => void
  pauseTimer: () => void
  resumeTimer: () => void
  /** 专注中途离开一次，记一笔 */
  noteInterruption: () => void
  resetTimer: (plannedSeconds?: number, mode?: TimerMode) => void
  setTimerSubject: (subject: string) => void
  /** 关掉「记下学了什么」的弹窗 */
  dismissFocusPrompt: () => void
  /** 删掉一段专注记录 */
  removeSession: (id: string) => void

  /** 这一段专注对准哪条今日计划；传空表示取消关联 */
  setTimerPlan: (planItemId?: string, subject?: string) => void
  /** 往某一天的计划里加一条；temp 表示当天临时加的，goalId 表示从目标拆下来的 */
  addPlanItem: (date: DateKey, text: string, temp?: boolean, goalId?: string) => void
  /** 从计划文件导入：按日期合并，同一天已有的条目保留，重复文案跳过 */
  importPlans: (plans: DailyPlan[]) => void
  togglePlanItem: (date: DateKey, id: string) => void
  removePlanItem: (date: DateKey, id: string) => void

  addStudyLog: (input: NewStudyInput) => void
  updateStudyLog: (id: string, patch: Partial<StudyLog>) => void
  /** 批量改记录，比如统一换科目 */
  updateStudyLogs: (ids: string[], patch: Partial<StudyLog>) => void
  deleteStudyLog: (id: string) => void
  /** 批量删除记录 */
  deleteStudyLogs: (ids: string[]) => void
  reviewStudyLog: (id: string) => void

  /** 存一份文档（本机 IndexedDB + 云模式下后台传服务器），返回元信息 */
  addDocument: (input: { name: string; mime: string; blob: Blob }) => Promise<DocumentMeta>
  /** 删除文档：本机、元信息、服务器一起清 */
  removeDocument: (id: string) => Promise<void>
  /** 打开文档：本机没有且服务器有就先下载回来 */
  openDocumentById: (id: string) => Promise<void>
  /** 把本机有、服务器没有的文档补传上去（进文档页时跑一次） */
  uploadPendingDocuments: () => Promise<void>

  addExpense: (input: NewExpenseInput) => void
  updateExpense: (id: string, patch: Partial<Expense>) => void
  removeExpense: (id: string) => void

  /** 专注时被发现用了娱乐应用：记一笔破戒 */
  logGuardHit: (input: { pkg: string; appName: string; category: GuardCategory; seconds: number }) => void
  /** 清空破戒记录 */
  clearGuardLogs: () => void

  /** 批量加单词（按 word 去重），返回实际加了多少个 */
  addWords: (items: { word: string; phonetic?: string; meaning?: string; example?: string; group?: string }[]) => number
  removeWord: (id: string) => void
  removeWords: (ids: string[]) => void
  /** 标记认识/不认识；不认识会顺手累一次复习计数 */
  setWordFamiliar: (id: string, familiar: 0 | 1) => void
  setWordsFamiliar: (ids: string[], familiar: 0 | 1) => void
  /** 学一个词：SM-2 四档评分（重来1/困难3/良好4/简单5）；低于 3 分进错词本、今天继续出现 */
  rateWord: (id: string, quality: number) => void
  /** 手动移出 / 放回错词本 */
  setWordWrong: (id: string, wrong: boolean) => void
  /** 整组改名，to 留空表示移到未分组 */
  renameWordGroup: (from: string, to: string) => void

  /** 刚导出过备份，记下时间 */
  markBackedUp: () => void

  addGoal: (input: NewGoalInput) => void
  updateGoal: (id: string, patch: Partial<Goal>) => void
  removeGoal: (id: string) => void
  addKeyResult: (goalId: string, title: string, target: number, unit: string) => void
  updateKeyResult: (goalId: string, krId: string, patch: { current?: number; title?: string; target?: number }) => void
  removeKeyResult: (goalId: string, krId: string) => void

  saveDailyReview: (review: DailyReview) => void
  saveWeeklyReview: (weekStart: DateKey, summary: string, adjusted: string) => void

  updateSettings: (patch: Partial<Settings>) => void
  replaceData: (next: AppData) => void
  resetData: () => void

  recordIntercept: (
    habitId: string,
    payload: { reason: string; process?: string; evidence?: string },
  ) => void
  completeRemedial: (id: string) => void
  repayDebt: (debtId: string) => void

  login: (email: string, password: string, endpoint?: string) => Promise<void>
  register: (email: string, password: string, endpoint?: string) => Promise<void>
  logout: () => void
  syncNow: () => Promise<void>
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'ok' | 'error'
  message?: string
  at?: string
}

interface StoreValue {
  data: AppData
  ready: boolean
  actions: StoreActions
  justFinished: string | null
  sync: SyncStatus
  /** 刚完成、等待补一条学习记录的那段专注 */
  focusPrompt: FocusSession | null
}

const StoreContext = createContext<StoreValue | null>(null)

const local = createLocalAdapter()
const CHANGED_KEY = 'kedu:changedAt'
const revisionCache = new Map<string, number>()

function codeKey(endpoint: string | undefined, token: string) {
  return `${endpoint ?? ''}|${token}`
}

function readChangedAt(): string {
  try {
    return localStorage.getItem(CHANGED_KEY) ?? ''
  } catch {
    return ''
  }
}

function markChanged() {
  try {
    localStorage.setItem(CHANGED_KEY, new Date().toISOString())
  } catch {
    /* 忽略存储异常 */
  }
}

/** 距离计时结束还剩多少秒 */
export function timerRemaining(timer: TimerState): number {
  if (!timer.running || !timer.startedAt) return timer.remainSeconds
  const elapsed = Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000)
  return Math.max(0, timer.plannedSeconds - elapsed)
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => createInitialData())
  const [ready, setReady] = useState(false)
  const [justFinished, setJustFinished] = useState<string | null>(null)
  const [focusPrompt, setFocusPrompt] = useState<FocusSession | null>(null)
  const [sync, setSync] = useState<SyncStatus>({ state: 'idle' })
  const dataRef = useRef(data)
  dataRef.current = data

  /** 把数据推到云端 */
  const pushNow = useCallback(async (d: AppData) => {
    const { account, sync: s } = d.settings
    if (s.mode !== 'cloud' || !account?.token) return false
    const key = codeKey(s.endpoint, account.token)
    try {
      const snap = await syncPush(s.endpoint, account.token, d, revisionCache.get(key) ?? 0)
      revisionCache.set(key, snap.revision)
      setSync({ state: 'ok', message: '已同步到云端', at: snap.updatedAt ?? new Date().toISOString() })
      return true
    } catch (err) {
      setSync({ state: 'error', message: err instanceof Error ? err.message : '同步失败' })
      return false
    }
  }, [])

  /** 登录/注册之后：云端已有数据就以云端为准，否则把本机数据推上去 */
  const bootstrapCloud = useCallback(
    async (endpoint: string | undefined, token: string, fallback: AppData) => {
      const key = codeKey(endpoint, token)
      const snap = await syncPull(endpoint, token)
      revisionCache.set(key, snap.revision)
      if (snap.data) {
        const cloud = normalizeData(snap.data)
        // 云端已有数据时，把本机的计划和单词合并进去，避免刚导入的内容被云端覆盖。
        // 计划：按日期合并，重复条目跳过；单词：按 word 去重。
        const localPlans = fallback.plans ?? []
        if (localPlans.length > 0) {
          const byDate = new Map(cloud.plans.map((p) => [p.date, p]))
          for (const p of localPlans) {
            const exist = byDate.get(p.date)
            if (!exist) {
              cloud.plans.push(p)
            } else {
              const texts = new Set(exist.items.map((i) => i.text.trim()))
              for (const it of p.items) {
                if (!texts.has(it.text.trim())) {
                  exist.items.push(it)
                  texts.add(it.text.trim())
                }
              }
            }
          }
          cloud.plans.sort((a, b) => (a.date < b.date ? -1 : 1))
        }
        const have = new Set((cloud.words || []).map((w) => String(w.word).toLowerCase()))
        for (const w of fallback.words || []) {
          const k = String(w?.word || '').toLowerCase()
          if (!k || have.has(k)) continue
          have.add(k)
          cloud.words.push(w)
        }
        setSync({ state: 'ok', message: '已从云端载入', at: snap.updatedAt ?? undefined })
        return cloud
      }
      const pushed = await syncPush(endpoint, token, fallback, snap.revision)
      revisionCache.set(key, pushed.revision)
      setSync({ state: 'ok', message: '本机数据已上传到云端', at: pushed.updatedAt ?? undefined })
      return fallback
    },
    [],
  )

  // 启动时读取本地数据 → 先显示出来 → 后台尝试云端同步
  useEffect(() => {
    let alive = true
    ;(async () => {
      const raw = await local.read()
      let parsed: AppData | null = null
      if (raw) {
        try {
          parsed = JSON.parse(raw) as AppData
        } catch {
          parsed = null
        }
      }
      const next = normalizeData(parsed)
      const { account } = next.settings
      // 先把本地数据摆上去，别让用户对着白屏等
      setData(next)
      setReady(true)

      // 已登录云账号 → 后台同步（不阻塞 UI）
      if (next.settings.sync.mode === 'cloud' && account?.token) {
        ;(async () => {
          try {
            const endpoint = next.settings.sync.endpoint
            const snap = await syncPull(endpoint, account.token)
            if (!alive) return
            revisionCache.set(codeKey(endpoint, account.token), snap.revision)
            // 云端词库并回本地：老客户端整包推送会把词表推空，重开时兜底不让词丢失
            const currentWords = dataRef.current.words || []
            if (snap.data && Array.isArray(snap.data.words)) {
              const have = new Set(currentWords.map((w) => String(w.word).toLowerCase()))
              const merged = [...currentWords]
              for (const w of snap.data.words as WordItem[]) {
                const k = String(w?.word || '').toLowerCase()
                if (!k || have.has(k)) continue
                have.add(k)
                merged.push(w)
              }
              // 合并进云端数据前先把本地词加上去
              if (snap.data.words) snap.data.words = merged
            }
            const localChanged = readChangedAt()
            if (snap.data && (!localChanged || (snap.updatedAt ?? '') > localChanged)) {
              const pulled = normalizeData(snap.data)
              pulled.settings.account = account
              // 云端较新时也别把本机刚导入的计划/单词丢掉，合并进去
              const localPlans = dataRef.current.plans ?? []
              const byDate = new Map(pulled.plans.map((p) => [p.date, p]))
              for (const p of localPlans) {
                const exist = byDate.get(p.date)
                if (!exist) {
                  pulled.plans.push(p)
                } else {
                  const texts = new Set(exist.items.map((i) => i.text.trim()))
                  for (const it of p.items) {
                    if (!texts.has(it.text.trim())) {
                      exist.items.push(it)
                      texts.add(it.text.trim())
                    }
                  }
                }
              }
              pulled.plans.sort((a, b) => (a.date < b.date ? -1 : 1))
              // 同步到全局（避免用闭包里可能过期的 next）
              setData(pulled)
              setSync({ state: 'ok', message: '已从云端载入', at: snap.updatedAt ?? undefined })
            }
          } catch (err) {
            if (alive) setSync({ state: 'error', message: err instanceof Error ? err.message : '云端读取失败' })
          }
        })()
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // 防抖持久化：本地永远写一份，云端模式再推一次
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => {
      local.write(JSON.stringify(data)).catch((err) => console.error('保存失败', err))
      markChanged()
      takeSnapshot(data)
      if (data.settings.sync.autoSync) void pushNow(data)
    }, 250)
    return () => clearTimeout(t)
  }, [data, ready, pushNow])

  // 多个标签页之间同步
  useEffect(() => {
    if (!local.subscribe) return
    return local.subscribe((payload) => {
      if (!payload) return
      try {
        setData(normalizeData(JSON.parse(payload) as AppData))
      } catch {
        /* ignore */
      }
    })
  }, [])

  const update = useCallback((fn: (draft: AppData) => AppData) => {
    setData((prev) => {
      const draft = structuredClone(prev)
      const next = fn(draft)
      // 每次数据变动后跑一遍成就检查，新解锁的徽章自动挂上去
      const newly = checkAchievements(next)
      if (newly.length > 0) {
        next.achievements = [...(next.achievements ?? []), ...newly]
      }
      return next
    })
  }, [])

  // 每天对账：把漏做的份额滚成欠账，连续断签则生成补救任务
  const reconcile = useCallback(() => {
    setData((prev) => {
      const draft = structuredClone(prev)
      return reconcileSupervision(draft, todayKey()) ? draft : prev
    })
  }, [])

  useEffect(() => {
    if (!ready) return
    reconcile()
    const id = setInterval(reconcile, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [ready, reconcile])

  const finishTimer = useCallback(() => {
    const t = dataRef.current.timer
    if (!t.running) return
    const now = new Date().toISOString()

    if (t.mode !== 'focus') {
      // 休息结束：开了「自动开始下一段」就直接跑起来，否则等用户手动开始
      const auto = dataRef.current.settings.pomodoro.autoStart
      const startedAt = new Date().toISOString()
      update((d) => {
        const focusSeconds = d.settings.pomodoro.focus * 60
        d.timer = {
          running: auto,
          mode: 'focus',
          plannedSeconds: focusSeconds,
          remainSeconds: focusSeconds,
          round: d.timer.round,
          subject: d.timer.subject,
          planItemId: d.timer.planItemId,
          ...(auto ? { startedAt, interruptions: 0 } : {}),
        }
        return d
      })
      setJustFinished('break')
      return
    }

    const session: FocusSession = {
      id: uid('s'),
      mode: 'focus',
      plannedMinutes: Math.round(t.plannedSeconds / 60),
      minutes: Math.round(t.plannedSeconds / 60),
      startedAt: t.startedAt ?? now,
      endedAt: now,
      subject: t.subject,
      completed: true,
      interruptions: t.interruptions ?? 0,
      planItemId: t.planItemId,
    }

    update((d) => {
      d.sessions.unshift(session)
      // 对准某条计划的专注做完了，就把那条自动勾掉；中断太多次的不算
      if ((t.interruptions ?? 0) < 2 && t.planItemId) {
        const item = d.plans.flatMap((p) => p.items).find((i) => i.id === t.planItemId)
        if (item) item.done = true
      }
      // 专注扭蛋：≥15 分钟算一次，往 focusGacha 里塞一个随机 emoji 标识
      if (session.minutes >= 15) {
        const g = drawGacha()
        d.focusGacha = [...(d.focusGacha ?? []), `${g.emoji}${g.id}`]
      }
      const nextRound = d.timer.round + 1
      const isLong = nextRound % d.settings.pomodoro.rounds === 1 && nextRound > 1
      const breakMin = isLong ? d.settings.pomodoro.longBreak : d.settings.pomodoro.shortBreak
      // 专注结束即时震动 + 铃声 + 通知横幅（静默失败，不阻塞主流程）
      void notifyFocusDone(
        session.minutes,
        t.subject,
        isLong ? 'longBreak' : 'shortBreak',
      )
      d.timer = {
        running: false,
        mode: 'break',
        plannedSeconds: breakMin * 60,
        remainSeconds: breakMin * 60,
        round: nextRound,
        subject: d.timer.subject,
        planItemId: undefined,
      }
      return d
    })

    setJustFinished('focus')
    // 一段专注刚结束：趁记忆还热，弹一个「记下学了什么」
    if ((t.interruptions ?? 0) < 2) setFocusPrompt(session)
  }, [update])

  // 计时器到点自动收尾（离开专注页也能正常工作）
  useEffect(() => {
    if (!data.timer.running) return
    const id = setInterval(() => {
      if (timerRemaining(dataRef.current.timer) <= 0) finishTimer()
    }, 800)
    return () => clearInterval(id)
  }, [data.timer.running, data.timer.startedAt, data.timer.mode, finishTimer])

  const actions = useMemo<StoreActions>(() => {
    const touchLog = (d: AppData, habitId: string, date: DateKey, count: number) => {
      const idx = d.habitLogs.findIndex((l) => l.habitId === habitId && l.date === date)
      // 补今天以前的打卡算「补录」，不进连续天数；今天打的卡记录时间戳给高效时段用
      const backfill = date !== todayKey()
      if (count <= 0) {
        if (idx >= 0) d.habitLogs.splice(idx, 1)
        return
      }
      if (idx >= 0) {
        d.habitLogs[idx].count = count
        d.habitLogs[idx].backfill = backfill || undefined
        if (!backfill) d.habitLogs[idx].markedAt = new Date().toISOString()
      } else {
        d.habitLogs.push({
          habitId,
          date,
          count,
          backfill: backfill || undefined,
          markedAt: backfill ? undefined : new Date().toISOString(),
        })
      }
    }

    return {
      toggleHabit(habitId, date) {
        const key = date ?? todayKey()
        update((d) => {
          const habit = d.habits.find((h) => h.id === habitId)
          if (!habit) return d
          const cur = d.habitLogs.find((l) => l.habitId === habitId && l.date === key)?.count ?? 0
          touchLog(d, habitId, key, cur >= habit.targetPerDay ? 0 : habit.targetPerDay)
          return d
        })
      },
      stepHabit(habitId, delta, date) {
        const key = date ?? todayKey()
        update((d) => {
          const habit = d.habits.find((h) => h.id === habitId)
          if (!habit) return d
          const cur = d.habitLogs.find((l) => l.habitId === habitId && l.date === key)?.count ?? 0
          touchLog(d, habitId, key, Math.max(0, Math.min(habit.targetPerDay, cur + delta)))
          return d
        })
      },
      setHabitCount(habitId, date, count) {
        update((d) => {
          const habit = d.habits.find((h) => h.id === habitId)
          if (!habit) return d
          touchLog(d, habitId, date, Math.max(0, Math.min(habit.targetPerDay, Math.round(count))))
          return d
        })
      },
      addHabit(input) {
        // 还有补救任务没做完时，先别急着开新坑
        if (isHabitCreationLocked(dataRef.current)) return
        update((d) => {
          d.habits.push({
            id: uid('h'),
            name: input.name,
            note: input.note,
            schedule: input.schedule,
            targetPerDay: Math.max(1, input.targetPerDay),
            createdAt: todayKey(),
            archived: false,
            sort: d.habits.length,
            preferredSlot: input.preferredSlot,
          })
          return d
        })
      },
      toggleRestDay(habitId, date) {
        update((d) => {
          const idx = d.habitLogs.findIndex((l) => l.habitId === habitId && l.date === date)
          if (idx >= 0) {
            const log = d.habitLogs[idx]
            if (log.restDay) {
              // 取消休息日：如果这天有打卡就保留打卡，没打卡就删整条
              if (log.count === 0) d.habitLogs.splice(idx, 1)
              else log.restDay = false
            } else {
              log.restDay = true
            }
          } else {
            d.habitLogs.push({ habitId, date, count: 0, restDay: true })
          }
          return d
        })
      },
      updateHabit(id, patch) {
        update((d) => {
          const h = d.habits.find((x) => x.id === id)
          if (h) Object.assign(h, patch)
          return d
        })
      },
      setHabitArchived(id, archived) {
        update((d) => {
          const h = d.habits.find((x) => x.id === id)
          if (h) h.archived = archived
          return d
        })
      },
      removeHabit(id) {
        update((d) => {
          d.habits = d.habits.filter((h) => h.id !== id)
          d.habitLogs = d.habitLogs.filter((l) => l.habitId !== id)
          return d
        })
      },

      startTimer(mode, plannedSeconds, subject) {
        update((d) => {
          const now = new Date().toISOString()
          d.timer = {
            running: true,
            mode,
            plannedSeconds,
            remainSeconds: plannedSeconds,
            startedAt: now,
            round: d.timer.round,
            subject: subject ?? d.timer.subject,
            interruptions: 0,
            planItemId: d.timer.planItemId,
          }
          return d
        })
      },
      pauseTimer() {
        update((d) => {
          d.timer.remainSeconds = timerRemaining(d.timer)
          d.timer.running = false
          d.timer.startedAt = undefined
          return d
        })
      },
      noteInterruption() {
        update((d) => {
          d.timer.interruptions = (d.timer.interruptions ?? 0) + 1
          return d
        })
      },
      resumeTimer() {
        update((d) => {
          // 把开始时间往前推，等价于「已过去的时间」，这样剩余时长和进度条都连续
          const elapsed = Math.max(0, d.timer.plannedSeconds - d.timer.remainSeconds)
          d.timer.running = true
          d.timer.startedAt = new Date(Date.now() - elapsed * 1000).toISOString()
          return d
        })
      },
      resetTimer(plannedSeconds, mode) {
        update((d) => {
          const sec = plannedSeconds ?? d.timer.plannedSeconds
          d.timer = {
            running: false,
            mode: mode ?? d.timer.mode,
            plannedSeconds: sec,
            remainSeconds: sec,
            round: d.timer.round,
            subject: d.timer.subject,
            interruptions: 0,
            planItemId: d.timer.planItemId,
          }
          return d
        })
      },
      setTimerSubject(subject) {
        update((d) => {
          d.timer.subject = subject
          return d
        })
      },
      setTimerPlan(planItemId, subject) {
        update((d) => {
          d.timer.planItemId = planItemId
          if (subject !== undefined) d.timer.subject = subject
          return d
        })
      },
      dismissFocusPrompt() {
        setFocusPrompt(null)
      },
      removeSession(id) {
        update((d) => {
          d.sessions = d.sessions.filter((s) => s.id !== id)
          return d
        })
      },

      addPlanItem(date, text, temp, goalId) {
        const body = text.trim()
        if (!body) return
        update((d) => {
          let plan = d.plans.find((p) => p.date === date)
          if (!plan) {
            plan = { date, items: [] }
            d.plans.push(plan)
          }
          plan.items.push({
            id: uid('p'),
            text: body,
            done: false,
            temp: temp || undefined,
            goalId,
          })
          return d
        })
      },
      importPlans(input) {
        update((d) => {
          for (const raw of input) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) continue
            const items = (raw.items ?? []).filter((i) => i && typeof i.text === 'string' && i.text.trim())
            if (items.length === 0) continue
            let plan = d.plans.find((p) => p.date === raw.date)
            if (!plan) {
              plan = { date: raw.date, items: [] }
              d.plans.push(plan)
            }
            const seenText = new Set(plan.items.map((i) => i.text.trim()))
            const seenId = new Set(plan.items.map((i) => i.id))
            for (const item of items) {
              const text = item.text.trim()
              if (seenText.has(text)) continue
              seenText.add(text)
              plan.items.push({
                id: item.id && !seenId.has(item.id) ? item.id : uid('p'),
                text,
                done: !!item.done,
                temp: item.temp || undefined,
                goalId: item.goalId,
              })
            }
          }
          d.plans.sort((a, b) => (a.date < b.date ? -1 : 1))
          // 和加载时一样，只留最近 PLAN_KEEP_DAYS 天，免得旧计划把数据撑大
          const cutoff = addDays(todayKey(), -PLAN_KEEP_DAYS)
          d.plans = d.plans.filter((p) => p.date >= cutoff)
          return d
        })
      },
      togglePlanItem(date, id) {
        update((d) => {
          const item = d.plans.find((p) => p.date === date)?.items.find((x) => x.id === id)
          if (item) item.done = !item.done
          return d
        })
      },
      removePlanItem(date, id) {
        update((d) => {
          const plan = d.plans.find((p) => p.date === date)
          if (plan) plan.items = plan.items.filter((x) => x.id !== id)
          return d
        })
      },

      addStudyLog(input) {
        update((d) => {
          const date = input.date ?? todayKey()
          const log: StudyLog = {
            id: uid('l'),
            date,
            title: input.title.trim(),
            subject: input.subject.trim() || '未分类',
            minutes: Math.max(0, input.minutes),
            content: input.content.trim(),
            tags: input.tags,
            createdAt: new Date().toISOString(),
            reviewStage: 0,
            nextReviewAt: addDays(date, REVIEW_INTERVALS[0]),
          }
          d.studyLogs.unshift(log)
          return d
        })
      },
      updateStudyLog(id, patch) {
        update((d) => {
          const l = d.studyLogs.find((x) => x.id === id)
          if (l) Object.assign(l, patch)
          return d
        })
      },
      updateStudyLogs(ids, patch) {
        if (ids.length === 0) return
        const target = new Set(ids)
        update((d) => {
          for (const l of d.studyLogs) {
            if (target.has(l.id)) Object.assign(l, patch)
          }
          return d
        })
      },
      deleteStudyLog(id) {
        update((d) => {
          d.studyLogs = d.studyLogs.filter((l) => l.id !== id)
          return d
        })
      },
      deleteStudyLogs(ids) {
        if (ids.length === 0) return
        const target = new Set(ids)
        update((d) => {
          d.studyLogs = d.studyLogs.filter((l) => !target.has(l.id))
          return d
        })
      },
      reviewStudyLog(id) {
        update((d) => {
          const l = d.studyLogs.find((x) => x.id === id)
          if (!l) return d
          const stage = l.reviewStage + 1
          if (stage >= REVIEW_INTERVALS.length) {
            l.reviewStage = stage
            l.lastReviewedAt = todayKey()
            l.nextReviewAt = undefined
          } else {
            l.reviewStage = stage
            l.lastReviewedAt = todayKey()
            l.nextReviewAt = addDays(todayKey(), REVIEW_INTERVALS[stage])
          }
          return d
        })
      },

      async addDocument(input) {
        const meta: DocumentMeta = {
          id: uid('d'),
          name: input.name,
          mime: input.mime,
          size: input.blob.size,
          uploadedAt: new Date().toISOString(),
        }
        await saveLocalBlob(meta.id, input.blob)
        update((d) => {
          d.documents.unshift(meta)
          return d
        })
        // 云模式下后台传一份到服务器，成功就回填 remoteId；失败不挡用户
        const { account, sync: s } = dataRef.current.settings
        if (s.mode === 'cloud' && account?.token) {
          void (async () => {
            try {
              const up = await fileUpload(s.endpoint, account.token!, {
                name: meta.name,
                mime: meta.mime,
                data: await blobToBase64(input.blob),
              })
              update((d) => {
                const doc = d.documents.find((x) => x.id === meta.id)
                if (doc) doc.remoteId = up.id
                return d
              })
            } catch {
              /* 下次进文档页会补传 */
            }
          })()
        }
        return meta
      },

      async removeDocument(id) {
        const meta = dataRef.current.documents.find((x) => x.id === id)
        await deleteLocalBlob(id).catch(() => {})
        update((d) => {
          d.documents = d.documents.filter((x) => x.id !== id)
          // 顺手把学习记录上的引用摘掉
          for (const l of d.studyLogs) {
            if (l.attachments?.includes(id)) {
              l.attachments = l.attachments.filter((a) => a !== id)
            }
          }
          return d
        })
        const { account, sync: s } = dataRef.current.settings
        if (meta?.remoteId && s.mode === 'cloud' && account?.token) {
          fileDelete(s.endpoint, account.token, meta.remoteId).catch(() => {})
        }
      },

      async openDocumentById(id) {
        const meta = dataRef.current.documents.find((x) => x.id === id)
        if (!meta) throw new Error('文档不存在')
        let blob = await readLocalBlob(id).catch(() => undefined)
        if (!blob && meta.remoteId) {
          const { account, sync: s } = dataRef.current.settings
          if (s.mode === 'cloud' && account?.token) {
            blob = await fileDownload(s.endpoint, account.token, meta.remoteId)
            await saveLocalBlob(id, blob).catch(() => {})
          }
        }
        if (!blob) throw new Error('本机没有这个文件，也没登录云账号下载')
        await openDocument(meta, blob)
      },

      async uploadPendingDocuments() {
        const { account, sync: s } = dataRef.current.settings
        if (s.mode !== 'cloud' || !account?.token) return
        for (const doc of dataRef.current.documents) {
          if (doc.remoteId) continue
          const blob = await readLocalBlob(doc.id).catch(() => undefined)
          if (!blob) continue
          try {
            const up = await fileUpload(s.endpoint, account.token, {
              name: doc.name,
              mime: doc.mime,
              data: await blobToBase64(blob),
            })
            update((d) => {
              const target = d.documents.find((x) => x.id === doc.id)
              if (target) target.remoteId = up.id
              return d
            })
          } catch {
            /* 网络不通就等下次 */
          }
        }
      },

      addExpense(input) {
        const amount = Math.abs(input.amount)
        if (!amount) return
        update((d) => {
          d.expenses.unshift({
            id: uid('e'),
            date: input.date ?? todayKey(),
            amount,
            type: input.type,
            category: input.category.trim() || '其他',
            note: input.note?.trim() || undefined,
            createdAt: new Date().toISOString(),
          })
          return d
        })
      },
      updateExpense(id, patch) {
        update((d) => {
          const e = d.expenses.find((x) => x.id === id)
          if (!e) return d
          Object.assign(e, patch)
          e.amount = Math.abs(e.amount)
          return d
        })
      },
      removeExpense(id) {
        update((d) => {
          d.expenses = d.expenses.filter((x) => x.id !== id)
          return d
        })
      },

      logGuardHit({ pkg, appName, category, seconds }) {
        update((d) => {
          const now = new Date()
          // 十分钟内同一个应用只记一条，时长累加，不然一条记录会刷屏
          const dup = d.guardLogs.find(
            (g) => g.pkg === pkg && now.getTime() - new Date(g.at).getTime() < 10 * 60000,
          )
          if (dup) {
            dup.at = now.toISOString()
            dup.seconds = Math.max(dup.seconds, seconds)
            return d
          }
          d.guardLogs.unshift({
            id: uid('g'),
            date: todayKey(),
            at: now.toISOString(),
            pkg,
            appName,
            category,
            seconds: Math.max(0, seconds),
          })
          d.guardLogs = d.guardLogs.slice(0, 400)
          return d
        })
      },
      clearGuardLogs() {
        update((d) => {
          d.guardLogs = []
          return d
        })
      },

      addWords(items) {
        const now = new Date().toISOString()
        let added = 0
        update((d) => {
          const existing = new Set(d.words.map((w) => w.word))
          for (const item of items) {
            const word = item.word.trim().toLowerCase()
            if (!word || existing.has(word)) continue
            existing.add(word)
            d.words.push({
              id: uid('w'),
              word,
              phonetic: item.phonetic || undefined,
              meaning: item.meaning || undefined,
              example: item.example || undefined,
              group: item.group || undefined,
              familiar: 0,
              addedAt: now,
              reviewCount: 0,
              stage: 0,
            })
            added += 1
          }
          return d
        })
        return added
      },
      removeWord(id) {
        update((d) => {
          d.words = d.words.filter((w) => w.id !== id)
          return d
        })
      },
      removeWords(ids) {
        if (ids.length === 0) return
        const drop = new Set(ids)
        update((d) => {
          d.words = d.words.filter((w) => !drop.has(w.id))
          return d
        })
      },
      setWordFamiliar(id, familiar) {
        update((d) => {
          const w = d.words.find((x) => x.id === id)
          if (!w) return d
          w.familiar = familiar
          if (familiar === 1) {
            w.stage = REVIEW_INTERVALS.length
            w.nextReviewAt = undefined
          } else {
            // 重学：从今天重新排队，仍在错词本里；EF 保留，间隔清零
            w.stage = 0
            w.interval = 0
            w.reviewCount += 1
            w.nextReviewAt = todayKey()
          }
          return d
        })
      },
      setWordsFamiliar(ids, familiar) {
        if (ids.length === 0) return
        const target = new Set(ids)
        const today = todayKey()
        update((d) => {
          for (const w of d.words) {
            if (!target.has(w.id)) continue
            w.familiar = familiar
            if (familiar === 1) {
              w.stage = REVIEW_INTERVALS.length
              w.nextReviewAt = undefined
            } else {
              w.stage = 0
              w.interval = 0
              w.reviewCount += 1
              w.nextReviewAt = today
            }
          }
          return d
        })
      },
      /** 学一个词：SM-2 动态间隔——按四档评分拉开复习，低于 3 分 EF 下调、今天重来并进错词本 */
      rateWord(id, quality) {
        update((d) => {
          const w = d.words.find((x) => x.id === id)
          if (!w) return d
          const today = todayKey()
          const isReview = w.stage > 0
          const r = sm2Rate(w, quality)
          w.stage = r.stage
          w.interval = r.interval
          w.easeFactor = r.easeFactor
          w.familiar = r.familiar
          w.nextReviewAt = r.nextReviewAt
          if (quality >= 3) {
            w.wrong = false
          } else {
            w.reviewCount += 1
            w.wrong = true
          }
          w.lastStudiedAt = today
          const p =
            d.wordProgress && d.wordProgress.date === today
              ? d.wordProgress
              : { date: today, count: 0, newCount: 0, reviewCount: 0 }
          p.count += 1
          if (isReview) p.reviewCount += 1
          else p.newCount += 1
          d.wordProgress = p
          // 同步记进历史，统计页画周/月曲线用
          let h = d.wordHistory.find((x) => x.date === today)
          if (!h) {
            h = { date: today, count: 0, newCount: 0, reviewCount: 0 }
            d.wordHistory.push(h)
            if (d.wordHistory.length > 400) d.wordHistory = d.wordHistory.slice(-400)
          }
          h.count += 1
          if (isReview) h.reviewCount += 1
          else h.newCount += 1
          return d
        })
      },
      renameWordGroup(from, to) {
        const next = to.trim()
        update((d) => {
          for (const w of d.words) {
            if ((w.group ?? '') === from) w.group = next || undefined
          }
          return d
        })
      },
      setWordWrong(id, wrong) {
        update((d) => {
          const w = d.words.find((x) => x.id === id)
          if (!w) return d
          w.wrong = wrong
          // 手动收进错词本：今天重新过一遍；移出去不再动复习计划
          if (wrong) {
            w.familiar = 0
            w.nextReviewAt = todayKey()
          }
          return d
        })
      },

      markBackedUp() {
        update((d) => {
          d.settings.backup = { ...d.settings.backup, lastExportedAt: new Date().toISOString() }
          return d
        })
      },

      addGoal(input) {
        update((d) => {
          d.goals.unshift({
            id: uid('g'),
            title: input.title.trim(),
            horizon: input.horizon,
            startDate: todayKey(),
            dueDate: input.dueDate,
            krs: [],
            status: 'active',
            createdAt: todayKey(),
          })
          return d
        })
      },
      updateGoal(id, patch) {
        update((d) => {
          const g = d.goals.find((x) => x.id === id)
          if (g) Object.assign(g, patch)
          return d
        })
      },
      removeGoal(id) {
        update((d) => {
          d.goals = d.goals.filter((g) => g.id !== id)
          return d
        })
      },
      addKeyResult(goalId, title, target, unit) {
        update((d) => {
          const g = d.goals.find((x) => x.id === goalId)
          if (g) g.krs.push({ id: uid('kr'), title, target, current: 0, unit })
          return d
        })
      },
      updateKeyResult(goalId, krId, patch) {
        update((d) => {
          const g = d.goals.find((x) => x.id === goalId)
          const kr = g?.krs.find((x) => x.id === krId)
          if (kr) Object.assign(kr, patch)
          return d
        })
      },
      removeKeyResult(goalId, krId) {
        update((d) => {
          const g = d.goals.find((x) => x.id === goalId)
          if (g) g.krs = g.krs.filter((k) => k.id !== krId)
          return d
        })
      },

      saveDailyReview(review) {
        update((d) => {
          const idx = d.dailyReviews.findIndex((r) => r.date === review.date)
          if (idx >= 0) d.dailyReviews[idx] = review
          else d.dailyReviews.push(review)
          return d
        })
      },
      saveWeeklyReview(weekStart, summary, adjusted) {
        update((d) => {
          const idx = d.weeklyReviews.findIndex((r) => r.weekStart === weekStart)
          const payload = { weekStart, summary, adjusted, createdAt: new Date().toISOString() }
          if (idx >= 0) d.weeklyReviews[idx] = payload
          else d.weeklyReviews.push(payload)
          return d
        })
      },

      updateSettings(patch) {
        update((d) => {
          d.settings = { ...d.settings, ...patch }
          return d
        })
      },
      replaceData(next) {
        setData(normalizeData(next))
      },
      resetData() {
        setData(createInitialData())
      },

      recordIntercept(habitId, payload) {
        update((d) => {
          const habit = d.habits.find((h) => h.id === habitId)
          if (!habit) return d
          const today = todayKey()
          const reason = payload.reason.trim()
          const process = payload.process?.trim() || undefined
          const evidence = payload.evidence?.trim() || undefined
          const dup = d.intercepts.find((r) => r.date === today && r.habitId === habitId)
          if (dup) {
            dup.reason = reason
            dup.process = process
            dup.evidence = evidence
          } else {
            d.intercepts.push({
              id: uid('i'),
              date: today,
              habitId,
              habitName: habit.name,
              reason,
              process,
              evidence,
              createdAt: new Date().toISOString(),
            })
          }
          return d
        })
      },

      completeRemedial(id) {
        update((d) => {
          const task = d.remedials.find((r) => r.id === id)
          if (!task || task.done) return d
          task.done = true
          task.doneAt = new Date().toISOString()
          // 补救 = 今天真的做了一次，同时抵掉最早的一笔欠账
          const debt = d.debts
            .filter((x) => x.habitId === task.habitId && x.amount - x.repaid > 0)
            .sort((a, b) => (a.date < b.date ? -1 : 1))[0]
          if (debt) debt.repaid += 1
          const today = todayKey()
          const log = d.habitLogs.find((l) => l.habitId === task.habitId && l.date === today)
          if (log) log.count += 1
          else d.habitLogs.push({ habitId: task.habitId, date: today, count: 1 })
          return d
        })
      },

      repayDebt(debtId) {
        update((d) => {
          const debt = d.debts.find((x) => x.id === debtId)
          if (!debt || debt.amount - debt.repaid <= 0) return d
          debt.repaid += 1
          const today = todayKey()
          const log = d.habitLogs.find((l) => l.habitId === debt.habitId && l.date === today)
          if (log) log.count += 1
          else d.habitLogs.push({ habitId: debt.habitId, date: today, count: 1 })
          return d
        })
      },

      async login(email, password, endpointOverride) {
        const endpoint = endpointOverride ?? dataRef.current.settings.sync.endpoint
        setSync({ state: 'syncing', message: '正在登录…' })
        try {
          const res = await authLogin(endpoint, email.trim(), password)
          const base = dataRef.current
          const account = {
            email: res.user.email,
            token: res.token,
            userId: res.user.id,
            loggedInAt: new Date().toISOString(),
          }
          const next: AppData = {
            ...base,
            settings: { ...base.settings, account, sync: { ...base.settings.sync, endpoint, mode: 'cloud' } },
          }
          const merged = await bootstrapCloud(endpoint, res.token, next)
          setData({
            ...merged,
            settings: {
              ...merged.settings,
              account,
              // 服务器地址以本机填的为准，不用云端里可能过期的旧地址
              sync: { ...merged.settings.sync, endpoint, mode: 'cloud' },
            },
          })
        } catch (err) {
          setSync({ state: 'error', message: err instanceof Error ? err.message : '登录失败' })
          throw err
        }
      },

      async register(email, password, endpointOverride) {
        const endpoint = endpointOverride ?? dataRef.current.settings.sync.endpoint
        setSync({ state: 'syncing', message: '正在注册…' })
        try {
          const res = await authRegister(endpoint, email.trim(), password)
          const base = dataRef.current
          const account = {
            email: res.user.email,
            token: res.token,
            userId: res.user.id,
            loggedInAt: new Date().toISOString(),
          }
          const next: AppData = {
            ...base,
            settings: { ...base.settings, account, sync: { ...base.settings.sync, endpoint, mode: 'cloud' } },
          }
          const merged = await bootstrapCloud(endpoint, res.token, next)
          setData({
            ...merged,
            settings: {
              ...merged.settings,
              account,
              // 服务器地址以本机填的为准，不用云端里可能过期的旧地址
              sync: { ...merged.settings.sync, endpoint, mode: 'cloud' },
            },
          })
        } catch (err) {
          setSync({ state: 'error', message: err instanceof Error ? err.message : '注册失败' })
          throw err
        }
      },

      logout() {
        update((d) => {
          delete d.settings.account
          d.settings.sync = { ...d.settings.sync, mode: 'local' }
          return d
        })
        setSync({ state: 'idle' })
      },

      async syncNow() {
        const d = dataRef.current
        const { account, sync: s } = d.settings
        if (!account?.token) throw new Error('请先登录账号')
        setSync({ state: 'syncing', message: '正在同步…' })
        try {
          const snap = await syncPull(s.endpoint, account.token)
          revisionCache.set(codeKey(s.endpoint, account.token), snap.revision)
          const localTime = readChangedAt()
          if (snap.data && (!localTime || (snap.updatedAt ?? '') > localTime)) {
            const remote = normalizeData(snap.data)
            setData({
              ...remote,
              settings: {
                ...remote.settings,
                account,
                sync: { ...remote.settings.sync, mode: 'cloud' },
              },
            })
            setSync({ state: 'ok', message: '已从云端更新', at: snap.updatedAt ?? undefined })
            return
          }
          await pushNow(d)
        } catch (err) {
          setSync({ state: 'error', message: err instanceof Error ? err.message : '同步失败' })
          throw err
        }
      },
    }
  }, [update, pushNow, bootstrapCloud])

  useEffect(() => {
    if (!justFinished) return
    const t = setTimeout(() => setJustFinished(null), 5000)
    return () => clearTimeout(t)
  }, [justFinished])

  const value = useMemo<StoreValue>(
    () => ({ data, ready, actions, justFinished, sync, focusPrompt }),
    [data, ready, actions, justFinished, sync, focusPrompt],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore 必须在 AppDataProvider 内使用')
  return ctx
}
