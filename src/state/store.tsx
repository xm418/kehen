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
import { createInitialData, normalizeData, REVIEW_INTERVALS } from '../core/store-model'
import { addDays, todayKey } from '../core/date'
import { uid } from '../core/id'
import type {
  AppData,
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
  addHabit: (input: NewHabitInput) => void
  updateHabit: (id: string, patch: Partial<Habit>) => void
  setHabitArchived: (id: string, archived: boolean) => void
  removeHabit: (id: string) => void

  startTimer: (mode: TimerMode, plannedSeconds: number, subject?: string) => void
  pauseTimer: () => void
  resumeTimer: () => void
  /** 专注中途离开一次，记一笔 */
  noteInterruption: () => void
  resetTimer: (plannedSeconds?: number, mode?: TimerMode) => void
  setTimerSubject: (subject: string) => void
  /** 关掉「记下学了什么」的弹窗 */
  dismissFocusPrompt: () => void

  /** 这一段专注对准哪条今日计划；传空表示取消关联 */
  setTimerPlan: (planItemId?: string, subject?: string) => void
  /** 往某一天的计划里加一条；temp 表示当天临时加的，goalId 表示从目标拆下来的 */
  addPlanItem: (date: DateKey, text: string, temp?: boolean, goalId?: string) => void
  togglePlanItem: (date: DateKey, id: string) => void
  removePlanItem: (date: DateKey, id: string) => void

  addStudyLog: (input: NewStudyInput) => void
  updateStudyLog: (id: string, patch: Partial<StudyLog>) => void
  deleteStudyLog: (id: string) => void
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
  /** 标记认识/不认识；不认识会顺手累一次复习计数 */
  setWordFamiliar: (id: string, familiar: 0 | 1) => void

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

  recordIntercept: (habitId: string, reason: string) => void
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
        setSync({ state: 'ok', message: '已从云端载入', at: snap.updatedAt ?? undefined })
        return normalizeData(snap.data)
      }
      const pushed = await syncPush(endpoint, token, fallback, snap.revision)
      revisionCache.set(key, pushed.revision)
      setSync({ state: 'ok', message: '本机数据已上传到云端', at: pushed.updatedAt ?? undefined })
      return fallback
    },
    [],
  )

  // 启动时读取本地数据；已登录则和云端对一次
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
      if (next.settings.sync.mode === 'cloud' && account?.token) {
        try {
          const endpoint = next.settings.sync.endpoint
          const snap = await syncPull(endpoint, account.token)
          revisionCache.set(codeKey(endpoint, account.token), snap.revision)
          // 云端词库并回本地：老客户端整包推送会把词表推空，重开时兜底不让词丢失
          if (snap.data && Array.isArray(snap.data.words)) {
            const have = new Set((next.words || []).map((w) => String(w.word).toLowerCase()))
            const merged = [...(next.words || [])]
            for (const w of snap.data.words as WordItem[]) {
              const k = String(w?.word || '').toLowerCase()
              if (!k || have.has(k)) continue
              have.add(k)
              merged.push(w)
            }
            next.words = merged
          }
          const localChanged = readChangedAt()
          if (snap.data && (!localChanged || (snap.updatedAt ?? '') > localChanged)) {
            if (!alive) return
            const pulled = normalizeData(snap.data)
            // 登录凭证只认本机：云端数据里没有 account 时也不能把自己踢下线
            pulled.settings.account = account
            setData(pulled)
            setSync({ state: 'ok', message: '已从云端载入', at: snap.updatedAt ?? undefined })
            setReady(true)
            return
          }
        } catch (err) {
          if (alive) setSync({ state: 'error', message: err instanceof Error ? err.message : '云端读取失败' })
        }
      }
      if (!alive) return
      setData(next)
      setReady(true)
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
    setData((prev) => fn(structuredClone(prev)))
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
      const nextRound = d.timer.round + 1
      const isLong = nextRound % d.settings.pomodoro.rounds === 1 && nextRound > 1
      const breakMin = isLong ? d.settings.pomodoro.longBreak : d.settings.pomodoro.shortBreak
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
      // 补今天以前的打卡算「补录」，不进连续天数
      const backfill = date !== todayKey()
      if (count <= 0) {
        if (idx >= 0) d.habitLogs.splice(idx, 1)
        return
      }
      if (idx >= 0) {
        d.habitLogs[idx].count = count
        d.habitLogs[idx].backfill = backfill || undefined
      } else d.habitLogs.push({ habitId, date, count, backfill: backfill || undefined })
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
          })
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
      deleteStudyLog(id) {
        update((d) => {
          d.studyLogs = d.studyLogs.filter((l) => l.id !== id)
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
      setWordFamiliar(id, familiar) {
        update((d) => {
          const w = d.words.find((x) => x.id === id)
          if (!w) return d
          w.familiar = familiar
          if (familiar === 0) w.reviewCount += 1
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

      recordIntercept(habitId, reason) {
        update((d) => {
          const habit = d.habits.find((h) => h.id === habitId)
          if (!habit) return d
          const today = todayKey()
          const text = reason.trim()
          const dup = d.intercepts.find((r) => r.date === today && r.habitId === habitId)
          if (dup) dup.reason = text
          else
            d.intercepts.push({
              id: uid('i'),
              date: today,
              habitId,
              habitName: habit.name,
              reason: text,
              createdAt: new Date().toISOString(),
            })
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
