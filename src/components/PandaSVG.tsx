/**
 * 刻刻 v3 —— 坐姿像素熊猫，24×24，完整四肢+尾巴+肉垫。
 * 调色板：
 *   . 透明  K 黑毛  W 白底  F 粉肉垫  D 深灰  R 红眼  G 金星  P 粉腮红
 * BASE = 完整身体（头+耳+黑眼圈+脖子+身体+白肚皮+前爪+后爪+尾巴+肉垫）
 * 叠层 = 眼睛瞳孔 + 鼻子嘴巴 + 腮红 + 眉毛 + 庆祝星星
 */
import type { PetMood } from '../core/pet'

const SIZE = 24
const PX = 1
type Cell = '.' | 'K' | 'W' | 'F' | 'D' | 'R' | 'G' | 'P'

/**
 *        0  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 21 22 23
 * ──────────────────────────────────────────────────────────────────────────────
 *  row0: .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .
 *  row1: .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .
 *  row2: .  .  .  .  K  K  .  .  .  .  .  .  .  .  .  .  .  K  K  .  .  .  .  .   ← 耳尖
 *  row3: .  .  .  K  K  K  K  .  .  .  .  .  .  .  .  .  K  K  K  K  .  .  .  .   ← 耳根
 *  row4: .  .  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  .  .  .   ← 头顶
 *  row5: .  K  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  K  .  .  .   ← 脸顶
 *  row6: .  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  .  .  .   ← 脸
 *  row7: .  K  W  W  K  K  K  K  W  W  W  W  W  W  K  K  K  K  W  W  K  .  .  .   ← 黑眼圈上沿
 *  row8: .  K  W  K  K  K  K  K  K  W  W  W  W  W  K  K  K  K  K  W  K  .  .  .   ← 黑眼圈完整
 *  row9: .  K  W  K  K  K  K  K  K  W  W  W  W  W  K  K  K  K  K  W  K  .  .  .
 *  row10: .  K  W  W  K  K  K  K  W  W  W  W  W  W  K  K  K  K  W  W  K  .  .  .   ← 黑眼圈下沿
 *  row11: .  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  .  .  .   ← 脸颊
 *  row12: .  .  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  .  .  .  .
 *  row13: .  .  .  K  K  W  W  W  W  W  W  W  W  W  W  W  W  K  K  .  .  .  .  .   ← 下巴 K 环
 *  row14: .  .  .  .  K  K  K  K  W  W  W  W  W  W  K  K  K  K  .  .  .  .  .  .   ← 下巴
 *  row15: .  .  .  .  K  K  K  K  K  K  K  K  K  K  K  K  K  K  .  .  .  .  .  .   ← 脖子黑
 *  row16: .  .  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  .  .  .   ← 身体顶
 *  row17: .  K  K  K  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  K  K  .  .   ← 前爪根 + 白肚皮 + 尾巴根
 *  row18: K  K  K  K  K  K  W  W  W  W  W  W  W  W  W  W  W  W  W  K  K  K  K  K   ← **左前爪外伸** + 身体 + **尾巴外伸**
 *  row19: K  K  K  K  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  K  K  .
 *  row20: K  K  K  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  K  .   ← **左后爪外伸** + 身体 + **右后爪外伸**
 *  row21: .  K  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  .  .
 *  row22: .  .  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  .  .   ← 爪底接地
 *  row23: .  .  F  F  .  .  .  .  .  .  .  .  .  .  .  .  .  F  F  .  F  F  .  .   ← 肉垫 + 尾巴尖粉
 */
const BASE: string[] = [
  "........................",  // 0
  "........................",  // 1
  "....KK......KK..........",  // 2  耳尖
  "...KKKK....KKKK.........",  // 3  耳根
  "..KKKKKKKKKKKKKKKKKKK...",  // 4  头顶
  ".KKWWWWWWWWWWWWWWWWWKK..",  // 5  脸顶
  ".KWWWWWWWWWWWWWWWWWWWK..",  // 6  脸
  ".KWWKKKKWWWWWWWWWWKKWWK.",  // 7  黑眼圈上沿
  ".KWKKKKKKWWWWWWWWKKKKWK.",  // 8  黑眼圈完整
  ".KWKKKKKKWWWWWWWWKKKKWK.",  // 9
  ".KWWKKKKWWWWWWWWWWKKWWK.",  // 10 黑眼圈下沿
  ".KWWWWWWWWWWWWWWWWWWWWK.",  // 11 脸颊
  "..KWWWWWWWWWWWWWWWWWWK..",  // 12
  "...KKWWWWWWWWWWWWWWKK...",  // 13 下巴
  "....KKKKWWWWWWWWKKKK....",  // 14
  "....KKKKKKKKKKKKKKKKKK..",  // 15 脖子黑
  "..KKKKKKKKKKKKKKKKKKKKK.",  // 16 身体顶
  ".KKKKWWWWWWWWWWWWWWKKKK.",  // 17 前爪根 + 白肚皮 + 尾巴根
  "KKKKKKWWWWWWWWWWWWWWKKKK",  // 18 左前爪外伸 + 身体 + 尾巴外伸
  "KKKKKWWWWWWWWWWWWWWWWKKK",  // 19
  "KKKKWWWWWWWWWWWWWWWWWWKK",  // 20 左后爪外伸 + 身体 + 右后爪外伸
  ".KKWWWWWWWWWWWWWWWWWWWWK",  // 21
  "..KKKKKKKKKKKKKKKKKKKKKK",  // 22 爪底
  "..FF............FF..FF..",  // 23 肉垫 F
]

// ===== 表情叠层 =====

// —— 眼睛瞳孔：左右各一个黑点（在黑眼圈内部）
// BASE row 8-9 col 8-13 是白眼区域（K外面的 W）
const EYE_PUPIL_IDLE: Record<number, Record<number, Cell>> = {
  8:  { 9: 'D', 14: 'D' },     // 瞳孔
  9:  { 9: 'D', 14: 'D' },
}

// —— 鼻子 + 嘴
// BASE row 13 col 10-13 是 W（下巴上沿中间）
const MOUTH: Record<number, Record<number, Cell>> = {
  13: { 11: 'D', 12: 'D' },                    // 鼻孔 2 格
  14: { 10: 'D', 11: 'W', 12: 'W', 13: 'D' },  // 上唇中央留白 = 嘴缝
  15: { 11: 'D', 12: 'D' },                    // 下唇
}

// —— 腮红（idle/focus 粉  P）
const CHEEK_SOFT: Record<number, Record<number, Cell>> = {
  12: { 5: 'P', 6: 'P', 17: 'P', 18: 'P' },
}

// —— 腮红（mad 红  R）
const CHEEK_HOT: Record<number, Record<number, Cell>> = {
  12: { 5: 'R', 6: 'R', 17: 'R', 18: 'R' },
}

// —— 眉毛（mad 下压变红 R；focus 平直深灰 D）
const BROW_MAD: Record<number, Record<number, Cell>> = {
  6: { 8: 'R', 9: 'R', 14: 'R', 15: 'R' },
  7: { 7: 'R', 16: 'R' },
}

const BROW_FOCUS: Record<number, Record<number, Cell>> = {
  // 在黑眼圈上方的白色脸颊画深灰眉毛，和下面的黑黑眼圈形成明显对比
  6: { 7: 'D', 8: 'D', 9: 'D', 15: 'D', 16: 'D', 17: 'D' },
  7: { 6: 'D', 17: 'D' },
}

// —— 怒目：眼白变黑 + 瞳孔消失
const EYE_MAD: Record<number, Record<number, Cell>> = {
  8:  { 9: 'K', 10: 'K', 13: 'K', 14: 'K' },
  9:  { 9: 'K', 10: 'K', 13: 'K', 14: 'K' },
}

// —— 星星（celebrate）—— 放在耳朵周围的空白区域
const STARS: Record<number, Record<number, Cell>> = {
  0:  { 11: 'G', 12: 'G' },          // 头顶正上方
  2:  { 1: 'G', 22: 'G' },           // 左耳左上 + 右耳右上
  4:  { 0: 'G', 23: 'G' },           // 头顶两侧
}

const PALETTE: Record<string, string> = {
  K: '#1a1a1a',  W: '#ffffff',  F: '#ffb3b3',
  D: '#2a2a2a',  R: '#c00000',  G: '#ffd700',  P: '#ffb3b3',
}

function buildGrid(mood: PetMood, frame: number): string[][] {
  const grid = BASE.map((r) => r.split(''))

  // 叠层应用函数
  const overlay = (dict: Record<number, Record<number, Cell>>) => {
    for (const [r, cols] of Object.entries(dict)) {
      const row = parseInt(r, 10)
      for (const [c, v] of Object.entries(cols)) grid[row][parseInt(c, 10)] = v
    }
  }

  // 基础表情
  overlay(EYE_PUPIL_IDLE)
  overlay(MOUTH)

  if (mood === 'idle' || mood === 'focus') overlay(CHEEK_SOFT)
  if (mood === 'mad') {
    overlay(EYE_MAD)
    overlay(CHEEK_HOT)
    overlay(BROW_MAD)
    // 嘴抿紧（把上唇中间 W 盖成 D）
    grid[14][11] = 'D'; grid[14][12] = 'D'
  }
  if (mood === 'focus') overlay(BROW_FOCUS)
  if (mood === 'celebrate') {
    overlay(CHEEK_SOFT)
    // 嘴变圆笑
    grid[14][11] = 'D'; grid[14][12] = 'D'
    grid[15][11] = 'W'; grid[15][12] = 'W'
    if (frame % 2 === 0) overlay(STARS)
  }

  return grid
}

function renderRects(grid: string[][]) {
  const rects: React.ReactElement[] = []
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c]
      if (cell === '.' || !PALETTE[cell]) continue
      rects.push(
        <rect key={`${r}-${c}`} x={c} y={r} width={PX} height={PX} fill={PALETTE[cell]} />,
      )
    }
  }
  return rects
}

interface Props {
  mood: PetMood
  size?: number
  className?: string
}

export function PandaSVG({ mood, size = 52, className = '' }: Props) {
  const grid = buildGrid(mood, 0)
  return (
    <svg
      className={`panda-px panda-px-${mood} ${className}`}
      width={size}
      height={size}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g className="px-wrapper">{renderRects(grid)}</g>
    </svg>
  )
}
