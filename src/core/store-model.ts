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
    settings: {
      ...base.settings,
      ...(raw.settings ?? {}),
      pomodoro: { ...base.settings.pomodoro, ...(raw.settings?.pomodoro ?? {}) },
      sync: { ...base.settings.sync, ...(raw.settings?.sync ?? {}) },
      supervision: { ...base.settings.supervision, ...(raw.settings?.supervision ?? {}) },
      focus: { ...base.settings.focus, ...(raw.settings?.focus ?? {}) },
      guard: { ...base.settings.guard, ...(raw.settings?.guard ?? {}) },
      backup: { ...base.settings.backup, ...(raw.settings?.backup ?? {}) },
    },
    timer: { ...base.timer, ...(raw.timer ?? {}) },
  }
}
