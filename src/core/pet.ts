/** 监督员猫 "刻刻" —— 三态状态机 + 文案池 + 每日评价生成 */

export type PetMood = 'idle' | 'focus' | 'mad' | 'celebrate'

export interface PetSnapshot {
  mood: PetMood
  /** 好感度 0-100，全勤/不破戒会涨，破戒会掉 */
  trust: number
  /** 今天专注分钟 */
  focusMin: number
  /** 今天破戒次数 */
  guardHits: number
  /** 今天习惯完成率 0-1 */
  habitRate: number
  /** 今天完整番茄数 */
  cleanSessions: number
  /** 连续打卡天数 */
  streak: number
}

export const PET_EMOJI: Record<PetMood, string> = {
  idle: '😺',
  focus: '🧐',
  mad: '😤',
  celebrate: '🥳',
}

/** 日常随机台词（点一下弹一条） */
const IDLE_LINES = [
  '摸鱼了吗？',
  '今天的番茄还没吃呢。',
  '翻手机之前先想 10 秒。',
  '专注是一种肌肉，越用越强。',
  '我在看着你哦 🐾',
  '别让我失望。',
  '慢慢来，不着急，但别停下。',
  '你可以的。我相信你。',
  '翻页？可以，但只翻一页。',
  '休息一下是对的。打开抖音就不对了。',
]

/** 专注进行中的台词 */
const FOCUS_LINES = [
  '我在这儿守着。',
  '别回头看通知栏。',
  '这段做完再看消息。',
  '坚持住，我陪你。',
  '翻手机 = 破戒，自己想清楚。',
]

/** 破戒台词（有愤怒等级） */
const MAD_LINES_1 = [
  '又切出去了？回来！',
  '我看到了哦，真的看到了。',
  '这也算一次破戒。',
]
const MAD_LINES_2 = [
  '连续破戒，你对得起自己吗？',
  '我都替你害臊。',
  '冷静一下。三秒后重新开始。',
]
const MAD_LINES_3 = [
  '别放弃，我还没。',
  '破戒不等于完蛋。回来接着做。',
  '今天中断 3 次了，但还剩机会。',
]

/** 庆祝台词 */
const CELEBRATE_LINES = [
  '连续打卡，厉害！',
  '今天全勤，给你鼓掌 🎉',
  '连续 ' + 'X' + ' 天，继续！',
  '今天表现不错，我原谅你之前的破戒。',
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** 根据快照挑一句最合适的台词 */
export function petSays(snap: PetSnapshot): string {
  if (snap.mood === 'mad') {
    if (snap.guardHits >= 3) return pick(MAD_LINES_3)
    if (snap.guardHits >= 2) return pick(MAD_LINES_2)
    return pick(MAD_LINES_1)
  }
  if (snap.mood === 'celebrate') {
    const line = pick(CELEBRATE_LINES)
    return line.includes('X') ? line.replace('X', String(snap.streak)) : line
  }
  if (snap.mood === 'focus') return pick(FOCUS_LINES)

  // idle：根据今天的数据给个性化台词
  if (snap.guardHits > 0 && snap.focusMin === 0) return '今天还没开始专注，破戒倒先记上了。'
  if (snap.focusMin === 0) return '今天一个番茄都没做，开始吧。'
  if (snap.focusMin < 25) return '才 ' + snap.focusMin + ' 分钟，再来一段？'
  if (snap.habitRate >= 0.99 && snap.guardHits === 0) return '今天几乎完美，别让最后半小时翻车。'
  if (snap.guardHits > 0) return '今天破戒 ' + snap.guardHits + ' 次，能复盘一下为什么吗？'
  return pick(IDLE_LINES)
}

/** 从 AppData 快照推导出宠物状态 */
export function derivePetMood(snap: Omit<PetSnapshot, 'mood'>, timerRunning: boolean, guardHitJustNow: boolean): PetMood {
  if (guardHitJustNow) return 'mad'
  if (timerRunning) return 'focus'
  if (snap.habitRate >= 0.99 && snap.guardHits === 0 && snap.focusMin >= 25) return 'celebrate'
  return 'idle'
}

/** 好感度变化（每次事件触发） */
export function adjustTrust(trust: number, event: 'focus_done' | 'guard_hit' | 'habit_done' | 'streak'): number {
  const delta: Record<typeof event, number> = {
    focus_done: 3,
    guard_hit: -5,
    habit_done: 1,
    streak: 5,
  }
  return Math.max(0, Math.min(100, trust + delta[event]))
}
