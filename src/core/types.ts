// 全局数据类型定义
export type DateKey = string // YYYY-MM-DD
export type Stamp = string // ISO 时间戳

/** 习惯的重复规则 */
export type HabitSchedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: number[] } // 0=周日 … 6=周六
  | { type: 'weekly'; times: number } // 每周几次

/** 习惯适合在哪个时段做（用户可手动设，也可由历史打卡时间自动推荐） */
export type EnergySlot = 'morning' | 'midday' | 'afternoon' | 'evening' | 'any'

export interface Habit {
  id: string
  name: string
  note?: string
  schedule: HabitSchedule
  targetPerDay: number
  createdAt: DateKey
  archived: boolean
  sort: number
  /** 你的高效时段：哪个时间段最适合做这件事 */
  preferredSlot?: EnergySlot
}

export interface HabitLog {
  habitId: string
  date: DateKey
  count: number
  /** 事后补录的打卡，不算进连续天数，避免数字骗自己 */
  backfill?: boolean
  /** 打卡发生的具体时间（用来推断高效时段） */
  markedAt?: Stamp
  /** 标记为休息日：生病/旅行/刻意放松——既不算完成也不算断签 */
  restDay?: boolean
}

export type TimerMode = 'focus' | 'break'

export interface FocusSession {
  id: string
  mode: TimerMode
  plannedMinutes: number
  minutes: number
  startedAt: Stamp
  endedAt: Stamp
  subject?: string
  completed: boolean
  /** 这一段中途离开过几次 */
  interruptions?: number
  /** 这一段对应哪条每日计划（有的话，完成时自动勾掉） */
  planItemId?: string
}

/** 学习记录，自带一轮间隔复习 */
export interface StudyLog {
  id: string
  date: DateKey
  title: string
  subject: string
  minutes: number
  content: string
  tags: string[]
  createdAt: Stamp
  reviewStage: number // 已完成的复习轮次，0 表示尚未开始
  lastReviewedAt?: DateKey
  nextReviewAt?: DateKey // 下次复习日期，为空表示无需复习
  /** 关联的文档 id 列表（对应 documents 里的 id） */
  attachments?: string[]
}

export interface KeyResult {
  id: string
  title: string
  target: number
  current: number
  unit: string
}

export interface Goal {
  id: string
  title: string
  horizon: 'week' | 'month' | 'quarter'
  startDate: DateKey
  dueDate: DateKey
  krs: KeyResult[]
  status: 'active' | 'done' | 'dropped'
  createdAt: DateKey
}

export interface DailyReview {
  date: DateKey
  score: number // 1 - 5
  wentWell: string
  blocked: string
  tomorrow: string
}

export interface WeeklyReview {
  weekStart: DateKey
  summary: string
  adjusted: string
  createdAt: Stamp
}

export interface PomodoroConfig {
  focus: number
  shortBreak: number
  longBreak: number
  rounds: number
  autoStart: boolean
}

export type SyncMode = 'local' | 'cloud'

/** 账号信息：token 只保存在本机，云端仅保存散列后的密码 */
export interface AccountState {
  email: string
  token: string
  userId?: string
  loggedInAt?: Stamp
}

export interface SyncState {
  mode: SyncMode
  /** 留空表示同源 /api，部署到服务器后填完整地址 */
  endpoint?: string
  /** 本地一改就自动推送云端 */
  autoSync: boolean
}

/** 监督机制的强度配置 */
export interface SupervisionConfig {
  /** 到点未完成时弹出强制拦截层 */
  intercept: boolean
  /** 每天几点之后算「到点」 */
  deadlineHour: number
  /** 断签后尝试系统通知 */
  notify: boolean
  /** 未完成按比例累积欠账 */
  debt: boolean
  /** 连续断签达到阈值后锁住新增习惯 */
  lock: boolean
  lockAfterMiss: number
  /** 监督员信任度（0-100），破戒掉、全勤涨 */
  petTrust?: number
}

/** 专注期间的防干扰设置 */
export interface FocusGuardConfig {
  /** 专注时切换页面要确认 */
  lock: boolean
  /** 专注时保持屏幕常亮 */
  keepAwake: boolean
}

/** 娱乐戒断：专注时盯住的三类应用 */
export type GuardCategory = 'video' | 'game' | 'novel'

export interface GuardConfig {
  /** 专注进行中监控手机前台应用（仅 APK 内生效） */
  enabled: boolean
  video: boolean
  game: boolean
  novel: boolean
}

/** 一次破戒：专注期间被发现用娱乐应用 */
export interface GuardLog {
  id: string
  date: DateKey
  at: Stamp
  pkg: string
  appName: string
  category: GuardCategory
  /** 连续停留了多久（秒） */
  seconds: number
}

/** 备份提醒：数据只在本机，隔太久没导出就提醒一次 */
export interface BackupConfig {
  enabled: boolean
  /** 最后一次导出备份的时间 */
  lastExportedAt?: Stamp
}

/** 单词模块的偏好 */
export interface WordSettings {
  /** 每天打算学多少个单词 */
  dailyGoal: number
}

/** 记账偏好 */
export interface BillSettings {
  /** 每月支出上限，0 表示不设预算 */
  monthlyBudget: number
}

export interface Settings {
  nickname: string
  theme: 'light' | 'dark'
  pomodoro: PomodoroConfig
  sync: SyncState
  account?: AccountState
  supervision: SupervisionConfig
  focus: FocusGuardConfig
  guard: GuardConfig
  backup: BackupConfig
  defaultFocusSubject: string
  words: WordSettings
  bills: BillSettings
}

/** 今天已经学过的单词数，跨天自动归零 */
export interface WordProgress {
  date: DateKey
  /** 今天一共学了多少个（新学 + 复习） */
  count: number
  /** 其中今天第一次见的新词 */
  newCount: number
  /** 其中按复习计划回来的词 */
  reviewCount: number
}

/** 一笔欠账：某天没做完的份额 */
export interface HabitDebt {
  id: string
  habitId: string
  habitName: string
  date: DateKey
  /** 欠下的次数 */
  amount: number
  /** 已经补回的次数 */
  repaid: number
  createdAt: Stamp
}

/**
 * 强制拦截时提交的证明。
 * reason 必写；process 描述做了什么；evidence 可选图片（base64 或文件路径）。
 */
export interface InterceptRecord {
  id: string
  date: DateKey
  habitId: string
  habitName: string
  reason: string
  /** 过程描述 — 实际做了哪些事、花了多久、卡在哪 */
  process?: string
  /** 证据图片 — base64 或本地文件路径 */
  evidence?: string
  createdAt: Stamp
}

/** 断签触发的补救任务，未完成前锁住新增习惯 */
export interface RemedialTask {
  id: string
  habitId: string
  habitName: string
  /** 触发当日 */
  date: DateKey
  missedDays: number
  done: boolean
  createdAt: Stamp
  doneAt?: Stamp
}

/** 每日计划里的一条 */
export interface PlanItem {
  id: string
  text: string
  done: boolean
  /** 当天临时加的，不是前一晚写好的 */
  temp?: boolean
  /** 从哪个目标拆下来的，用来回看目标推进情况 */
  goalId?: string
}

/** 某一天的计划：通常在前一天晚上写好，当天还可以临时追加 */
export interface DailyPlan {
  date: DateKey
  items: PlanItem[]
}

/** 记账：一笔收入或支出 */
export type ExpenseType = 'expense' | 'income'

export interface Expense {
  id: string
  date: DateKey
  /** 金额，永远是正数，方向由 type 决定 */
  amount: number
  type: ExpenseType
  category: string
  note?: string
  createdAt: Stamp
}

/** 计时器状态：只存「开始时的时间点」，避免每秒写库 */
export interface TimerState {
  running: boolean
  mode: TimerMode
  plannedSeconds: number
  /** 暂停时剩余秒数 */
  remainSeconds: number
  /** 运行中：计时开始的时间戳 */
  startedAt?: Stamp
  subject?: string
  round: number
  /** 这一段专注中途离开过几次 */
  interruptions?: number
  /** 这一段对准哪条每日计划 */
  planItemId?: string
}

/** 一份上传的文档（Word/PDF 等）。内容本体存 IndexedDB / 服务器，这里只存元信息 */
export interface DocumentMeta {
  id: string
  name: string
  mime: string
  /** 字节数 */
  size: number
  uploadedAt: Stamp
  /** 服务器上的文件 id，上传成功后回填 */
  remoteId?: string
}

/** 一个英语单词：音标/释义允许留空，导入时会尽量补全 */
export interface WordItem {
  id: string
  word: string
  phonetic?: string
  meaning?: string
  /** 例句（词典补全时顺手带的） */
  example?: string
  /** 分组：词书/单元，如「必考词 U1」 */
  group?: string
  /** 1 表示已经认识，不再进学习队列 */
  familiar: 0 | 1
  addedAt: Stamp
  /** 「不认识」的次数，越多排越前 */
  reviewCount: number
  /** 已完成的复习轮次：0 是新词，连续答对 MASTER_STAGE 轮算掌握 */
  stage: number
  /** 下次复习日期，空表示今天不用再学 */
  nextReviewAt?: DateKey
  /** 最后一次学它的日期 */
  lastStudiedAt?: DateKey
  /** 错过（点不认识或测验答错），进错词本 */
  wrong?: boolean
  /** SM-2 难度系数：默认 2.5，答错下调，最低 1.3 */
  easeFactor?: number
  /** 当前一轮的间隔天数（0 表示还没排） */
  interval?: number
}

/** 某一天的单词学习量，给统计曲线用 */
export interface WordDayStat {
  date: DateKey
  /** 当天一共学了多少个（新学 + 复习） */
  count: number
  newCount: number
  reviewCount: number
}

/** 成就徽章定义：纯前端检查，达成条件后解锁 */
export interface Achievement {
  id: string
  title: string
  icon: string
  desc: string
  unlockedAt?: Stamp
}

export interface AppData {
  version: number
  words: WordItem[]
  wordProgress: WordProgress
  /** 每天学词量的历史记录，统计页画曲线用 */
  wordHistory: WordDayStat[]
  /** 已解锁的成就徽章，id 对应 ACHIEVEMENTS 里的定义 */
  achievements: string[]
  /** 专注扭蛋：收集到的奖励条目，每次完成专注（≥15min）抽一个 */
  focusGacha: string[]
  habits: Habit[]
  habitLogs: HabitLog[]
  sessions: FocusSession[]
  studyLogs: StudyLog[]
  goals: Goal[]
  dailyReviews: DailyReview[]
  weeklyReviews: WeeklyReview[]
  debts: HabitDebt[]
  intercepts: InterceptRecord[]
  remedials: RemedialTask[]
  plans: DailyPlan[]
  expenses: Expense[]
  guardLogs: GuardLog[]
  documents: DocumentMeta[]
  settings: Settings
  timer: TimerState
}
