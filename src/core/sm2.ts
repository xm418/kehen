import { addDays, todayKey } from './date'
import type { WordItem } from './types'

/**
 * SM-2 间隔重复算法（墨墨/Anki 同款思路）：
 * 答对后间隔按难度系数 EF 动态放大，答错则回到今天重来、EF 下调。
 * 相比固定的 1/3/7/15/30/90 天，记不住的词回得更勤，顺的词拉得更开。
 */

/** EF 默认值（SM-2 标准初始值） */
export const DEFAULT_EF = 2.5
/** EF 下限，防止反复答错后间隔再也长不起来 */
export const MIN_EF = 1.3
/** 连续答对这么多轮算掌握（标熟、不再进队列） */
export const MASTER_STAGE = 6

/**
 * 四档评分（学 Anki）：重来 1 / 困难 3 / 良好 4 / 简单 5。
 * 困难：阶段照推进，但间隔只涨 20%；简单：间隔按 EF×1.4 加速。
 */
export const GRADE_AGAIN = 1
export const GRADE_HARD = 3
export const GRADE_GOOD = 4
export const GRADE_EASY = 5

/** 答对后的间隔天数：第 1 轮 1 天，第 2 轮 6 天，之后按 EF 放大；困难减速、简单加速 */
export function nextInterval(stage: number, prevInterval: number, ef: number, q: number = GRADE_GOOD): number {
  if (q >= GRADE_EASY) {
    if (stage <= 1) return 3
    if (stage === 2) return 8
    return Math.max(1, Math.round(prevInterval * ef * 1.4))
  }
  if (q === GRADE_HARD) {
    if (stage <= 1) return 1
    if (stage === 2) return 3
    return Math.max(prevInterval, Math.round(prevInterval * 1.2))
  }
  if (stage <= 1) return 1
  if (stage === 2) return 6
  return Math.max(1, Math.round(prevInterval * ef))
}

export interface Sm2Result {
  stage: number
  interval: number
  easeFactor: number
  familiar: 0 | 1
  nextReviewAt?: string
}

/** 评一个词：quality 0-5，小于 3 算没过关（重来），大于等于 3 往后排 */
export function sm2Rate(
  w: Pick<WordItem, 'stage' | 'easeFactor' | 'interval'>,
  quality: number,
): Sm2Result {
  const ef0 = typeof w.easeFactor === 'number' ? w.easeFactor : DEFAULT_EF
  const q = Math.max(0, Math.min(5, Math.round(quality)))
  // SM-2 原公式：EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
  // 答「简单」EF 上升、间隔越拉越快；答「困难/重来」EF 下降
  const ef = Math.max(MIN_EF, ef0 + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  const easeFactor = Math.round(ef * 100) / 100

  if (q < GRADE_HARD) {
    // 没记住：回到今天重学，阶段清零
    return { stage: 0, interval: 0, easeFactor, familiar: 0, nextReviewAt: todayKey() }
  }

  const stage = w.stage + 1
  const interval = nextInterval(stage, w.interval ?? 0, ef, q)
  if (stage >= MASTER_STAGE) {
    return { stage, interval, easeFactor, familiar: 1, nextReviewAt: undefined }
  }
  return { stage, interval, easeFactor, familiar: 0, nextReviewAt: addDays(todayKey(), interval) }
}
