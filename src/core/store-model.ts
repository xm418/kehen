import { addDays, todayKey } from './date'
import { uid } from './id'
import type { AppData, BackupConfig, DailyPlan, GuardConfig, Settings, SupervisionConfig } from './types'

export const REVIEW_INTERVALS = [1, 3, 7, 15, 30, 90]

/** 每日计划只留最近这么多天，避免数据无限增长 */
export const PLAN_KEEP_DAYS = 180

function prunePlans(plans: DailyPlan[]): DailyPlan[] {
  const cutoff = addDays(todayKey(), -PLAN_KEEP_DAYS)
  return plans.filter((p) => p.date >= cutoff)
}

export const DEFAULT_SUPERVISION: SupervisionConfig = {
  intercept: true,
  deadlineHour: 21,
  notify: true,
  debt: true,
  lock: true,
  lockAfterMiss: 3,
}

export const DEFAULT_GUARD: GuardConfig = {
  enabled: true,
  video: true,
  game: true,
  novel: true,
}

export const DEFAULT_BACKUP: BackupConfig = {
  enabled: true,
}

export const DEFAULT_SETTINGS: Settings = {
  nickname: '',
  theme: 'light',
  pomodoro: { focus: 25, shortBreak: 5, longBreak: 15, rounds: 4, autoStart: false },
  sync: { mode: 'local', autoSync: true },
  supervision: { ...DEFAULT_SUPERVISION },
  focus: { lock: true, keepAwake: true },
  guard: { ...DEFAULT_GUARD },
  backup: { ...DEFAULT_BACKUP },
  defaultFocusSubject: '专业学习',
  words: { dailyGoal: 30 },
  bills: { monthlyBudget: 0 },
}

/** 首次使用时的初始数据：只放最少的两条，其余交给用户自己定义 */
export function createInitialData(): AppData {
  const now = todayKey()
  return {
    version: 1,
    habits: [
      {
        id: uid('h'),
        name: '早起',
        schedule: { type: 'daily' },
        targetPerDay: 1,
        createdAt: now,
        archived: false,
        sort: 0,
      },
      {
        id: uid('h'),
        name: '专注学习 1 小时',
        schedule: { type: 'daily' },
        targetPerDay: 1,
        createdAt: now,
        archived: false,
        sort: 1,
      },
    ],
    habitLogs: [],
    sessions: [],
    studyLogs: [],
    goals: [],
    dailyReviews: [],
    weeklyReviews: [],
    debts: [],
    intercepts: [],
    remedials: [],
    plans: [],
    expenses: [],
    guardLogs: [],
    documents: [],
    words: [],
    wordProgress: { date: now, count: 0, newCount: 0, reviewCount: 0 },
    wordHistory: [],
    achievements: [],
    focusGacha: [],
    settings: { ...DEFAULT_SETTINGS },
    timer: {
      running: false,
      mode: 'focus',
      plannedSeconds: DEFAULT_SETTINGS.pomodoro.focus * 60,
      remainSeconds: DEFAULT_SETTINGS.pomodoro.focus * 60,
      round: 1,
    },
  }
}

/** 兼容旧版本数据：补齐缺失字段 */
export function normalizeData(raw: Partial<AppData> | null): AppData {
  const base = createInitialData()
  if (!raw) return base
  return {
    version: raw.version ?? 1,
    habits: raw.habits ?? base.habits,
    habitLogs: raw.habitLogs ?? [],
    sessions: raw.sessions ?? [],
    studyLogs: raw.studyLogs ?? [],
    goals: raw.goals ?? [],
    dailyReviews: raw.dailyReviews ?? [],
    weeklyReviews: raw.weeklyReviews ?? [],
    debts: raw.debts ?? [],
    intercepts: raw.intercepts ?? [],
    remedials: raw.remedials ?? [],
    plans: prunePlans(raw.plans ?? []),
    expenses: raw.expenses ?? [],
    guardLogs: raw.guardLogs ?? [],
    documents: raw.documents ?? [],
    words: (raw.words ?? []).map((w) => {
      // 旧数据没有复习阶段：已经标熟的直接算掌握，其余按新词排队
      const stage = typeof w.stage === 'number' ? w.stage : w.familiar === 1 ? REVIEW_INTERVALS.length : 0
      return {
        ...w,
        stage,
        wrong: !!w.wrong,
        // 旧数据没有 SM-2 字段：间隔按原阶段折算（比如第 3 轮 ≈ 7 天），EF 取默认值
        interval:
          typeof w.interval === 'number'
            ? w.interval
            : stage > 0
              ? REVIEW_INTERVALS[Math.min(stage, REVIEW_INTERVALS.length) - 1]
              : 0,
        easeFactor: typeof w.easeFactor === 'number' ? w.easeFactor : undefined,
      }
    }),
    wordProgress:
      raw.wordProgress && raw.wordProgress.date === todayKey()
        ? {
            date: raw.wordProgress.date,
            count: raw.wordProgress.count ?? 0,
            newCount: raw.wordProgress.newCount ?? 0,
            reviewCount: raw.wordProgress.reviewCount ?? 0,
          }
        : { date: todayKey(), count: 0, newCount: 0, reviewCount: 0 },
    // 学词历史只留最近 400 天
    wordHistory: (raw.wordHistory ?? [])
      .filter((h) => h && typeof h.date === 'string' && typeof h.count === 'number')
      .slice(-400),
    achievements: Array.isArray(raw.achievements) ? raw.achievements : [],
    focusGacha: Array.isArray(raw.focusGacha) ? raw.focusGacha : [],
    settings: {
      ...base.settings,
      ...(raw.settings ?? {}),
      pomodoro: { ...base.settings.pomodoro, ...(raw.settings?.pomodoro ?? {}) },
      sync: { ...base.settings.sync, ...(raw.settings?.sync ?? {}) },
      supervision: { ...base.settings.supervision, ...(raw.settings?.supervision ?? {}) },
      focus: { ...base.settings.focus, ...(raw.settings?.focus ?? {}) },
      guard: { ...base.settings.guard, ...(raw.settings?.guard ?? {}) },
      backup: { ...base.settings.backup, ...(raw.settings?.backup ?? {}) },
      words: { ...base.settings.words, ...(raw.settings?.words ?? {}) },
      bills: { ...base.settings.bills, ...(raw.settings?.bills ?? {}) },
    },
    timer: { ...base.timer, ...(raw.timer ?? {}) },
  }
}
