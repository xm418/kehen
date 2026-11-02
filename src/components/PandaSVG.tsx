/**
 * 刻刻（像素版 v2）—— 24×24 网格完整坐姿熊猫。
 * 调色板:
 *   . 透明   K 黑毛(#1a1a1a)   W 白底(#fff)   D 深灰(#2a2a2a)
 *   R 红眼(#c00)   G 金星(#ffd700)   P 粉腮红(#ffb3b3)
 *   T 尾巴尖   F 爪底粉肉垫(#ffb3b3)
 *
 * BASE = 头 + 身体 + 四肢 + 短尾巴 + 爪底。
 * mood 叠层 = 眉毛 + 腮红 + 眼睛 + 星星（celebrate）。
 */
import type { PetMood } from '../core/pet'

const SIZE = 24
const PX = 1

type Cell = '.' | 'K' | 'W' | 'D' | 'R' | 'G' | 'P' | 'F' | 'T'

/**
 *   0  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 21 22 23
 * ────────────────────────────────────────────────────────────────────────────
 * 0   .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .
 * 1   .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .
 * 2   .  .  .  .  K  K  .  .  .  .  .  .  .  .  .  .  .  K  K  .  .  .  .  .   ← 耳尖
 * 3   .  .  .  K  K  K  K  .  .  .  .  .  .  .  .  .  K  K  K  K  .  .  .  .   ← 耳根
 * 4   .  .  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  .  .  .   ← 头顶
 * 5   .  K  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  K  .  .  .   ← 脸顶
 * 6   .  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  .  .  .   ← 脸
 * 7   .  K  W  W  K  K  K  K  W  W  W  W  W  K  K  K  K  W  W  W  K  .  .  .   ← 黑眼圈上沿
 * 8   .  K  W  K  K  K  K  K  K  W  W  W  K  K  K  K  K  K  W  W  K  .  .  .   ← 黑眼圈完整
 * 9   .  K  W  K  K  K  K  K  K  W  W  W  K  K  K  K  K  K  W  W  K  .  .  .
 * 10  .  K  W  W  K  K  K  K  W  W  W  W  W  K  K  K  K  W  W  W  K  .  .  .   ← 黑眼圈下沿
 * 11  .  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  .  .  .   ← 脸颊
 * 12  .  .  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  .  .  .
 * 13  .  .  .  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  .  .  .  .  .
 * 14  .  .  .  .  K  K  K  W  W  W  W  W  W  W  W  W  K  K  .  .  .  .  .  .   ← 下巴
 * 15  .  .  .  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  .  .  .  .  .   ← 脖子黑
 * 16  .  .  .  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  .  .  .   ← 身体顶
 * 17  .  .  K  K  K  K  K  K  W  W  W  W  W  W  W  W  K  K  K  K  K  .  .  .   ← 前爪顶
 * 18  .  .  K  K  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  K  K  .  .   ← 肚皮 + 尾巴根
 * 19  .  .  K  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  K  .  .   ← 身体中部
 * 20  .  K  K  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  K  .  .  .   ← 后爪顶
 * 21  .  K  K  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  W  K  .  .  .   ← 后爪
 * 22  .  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  K  .   ← 爪底 / 尾巴尖
 * 23  .  .  F  F  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  F  F  .  .   ← 肉垫 + 尾巴尖
 */
const BASE: string[] = [
  '........................', // 0
  '........................', // 1
  '....KK..........KK......', // 2  耳尖
  '...KKKK........KKKK.....', // 3  耳根
  '..KKKKKKKKKKKKKKKKKKK...', // 4  头顶（更宽）
  '.KKWWWWWWWWWWWWWWWWWKK..', // 5  脸顶
  '.KWWWWWWWWWWWWWWWWWWWK..', // 6  脸
  '.KWWKKKKWWWWWWWWWWKKWWK.', // 7  黑眼圈上沿
  '.KWKKKKKKWWWWWWWWKKKKWK.', // 8  黑眼圈完整
  '.KWKKKKKKWWWWWWWWKKKKWK.', // 9
  '.KWWKKKKWWWWWWWWWWKKWWK.', // 10 黑眼圈下沿
  '.KWWWWWWWWWWWWWWWWWWWWK.', // 11 脸颊
  '..KWWWWWWWWWWWWWWWWWWK..', // 12
  '...KKWWWWWWWWWWWWWWKK...', // 13
  '....KKKKWWWWWWWWKKKK....', // 14 下巴
  '...KKKKKKKKKKKKKKKKKK...', // 15 脖子黑
  '..KKKKKKKKKKKKKKKKKKKK..', // 16 身体顶
  '.KKKKKKKKWWWWWWWWKKKKKKK', // 17 前爪 + 肚皮顶  (注意末尾 KKK → 尾巴根)
  '.KKKKKWWWWWWWWWWWWWWKKKK', // 18 肚皮 + 尾巴根
  '.KKKKWWWWWWWWWWWWWWWWKKK', // 19
  '.KKKWWWWWWWWWWWWWWWWWWWK', // 20 后爪顶
  '.KKWWWWWWWWWWWWWWWWWWWWK', // 21 后爪
  '.KKKKKKKKKKKKKKKKKKKKKKK', // 22 爪底
  '..FF..........FF..FF....', // 23 肉垫 + 尾巴尖(T)
]

// —— 嘴巴（鼻孔 + 嘴）
const MOUTH: Record<number, Record<number, Cell>> = {
  13: { 10: 'D', 11: 'D', 12: 'D' },                      // 鼻孔
  14: { 10: 'D', 11: 'W', 12: 'W', 13: 'D' },             // 嘴的两瓣（中间留白）
  15: { 11: 'D', 12: 'D' },                                // 下唇
}

// —— 眼睛：正常眼珠位置（左右各两格白）
const EYE_IDLE: Record<number, Record<number, Cell>> = {
  8:  { 9: 'W', 14: 'W' },
  9:  { 9: 'W', 10: 'W', 14: 'W', 15: 'W' },
  10: { 9: 'W', 10: 'W', 14: 'W', 15: 'W' },
}

// —— 前爪（两个 K 块）和后爪
const PAWS: Record<number, Record<number, Cell>> = {
  17: { 2: 'K', 3: 'K', 21: 'K', 22: 'K' },
  18: { 2: 'K', 3: 'K', 4: 'K', 21: 'K', 22: 'K' },
  19: { 2: 'K', 3: 'K', 21: 'K', 22: 'K' },
  20: { 1: 'K', 2: 'K', 21: 'K', 22: 'K' },
  21: { 1: 'K', 2: 'K' },
}

// —— 尾巴（身体右侧一个小 K 块）
const TAIL: Record<number, Record<number, Cell>> = {
  17: { 22: 'T' },
  18: { 22: 'T', 23: 'T' },
  19: { 22: 'T', 23: 'T' },
  20: { 22: 'T' },
}

// —— 腮红（idle/focus 粉）
const CHEEK_SOFT: Record<number, Record<number, Cell>> = {
  12: { 5: 'P', 6: 'P', 17: 'P', 18: 'P' },
}

// —— 腮红（mad 红）
const CHEEK_HOT: Record<number, Record<number, Cell>> = {
  12: { 5: 'R', 6: 'R', 17: 'R', 18: 'R' },
}

// —— 眉毛 (mad 下压红 / focus 平直深灰)
const BROW_MAD: Record<number, Record<number, Cell>> = {
  6: { 8: 'R', 9: 'R', 14: 'R', 15: 'R' },
  7: { 7: 'R', 16: 'R' },
}

const BROW_FOCUS: Record<number, Record<number, Cell>> = {
  6: { 8: 'D', 9: 'D', 14: 'D', 15: 'D' },
}

// —— 庆祝星星
const STARS: Record<number, Record<number, Cell>> = {
  0:  { 11: 'G', 12: 'G' },
  1:  { 5: 'G', 18: 'G' },
}

const PALETTE: Record<string, string> = {
  K: '#1a1a1a',
  W: '#ffffff',
  D: '#2a2a2a',
  R: '#c00000',
  G: '#ffd700',
  P: '#ffb3b3',
  F: '#ffb3b3', // 爪底肉垫（和腮红同色）
  T: '#1a1a1a', // 尾巴尖
}

function buildGrid(mood: PetMood, frame: number): string[][] {
  const grid: string[][] = BASE.map((row) => row.split(''))

  // 覆盖爪子 + 尾巴（所有 mood 都有）
  for (const [r, cols] of Object.entries(PAWS)) {
    const row = parseInt(r, 10)
    for (const [c, v] of Object.entries(cols)) grid[row][parseInt(c, 10)] = v
  }
  for (const [r, cols] of Object.entries(TAIL)) {
    const row = parseInt(r, 10)
    for (const [c, v] of Object.entries(cols)) grid[row][parseInt(c, 10)] = v
  }

  // 嘴巴
  for (const [r, cols] of Object.entries(MOUTH)) {
    const row = parseInt(r, 10)
    for (const [c, v] of Object.entries(cols)) grid[row][parseInt(c, 10)] = v
  }

  // 眼睛
  for (const [r, cols] of Object.entries(EYE_IDLE)) {
    const row = parseInt(r, 10)
    for (const [c, v] of Object.entries(cols)) grid[row][parseInt(c, 10)] = v
  }

  if (mood === 'idle' || mood === 'focus') {
    for (const [r, cols] of Object.entries(CHEEK_SOFT)) {
      const row = parseInt(r, 10)
      for (const [c, v] of Object.entries(cols)) grid[row][parseInt(c, 10)] = v
    }
  }

  if (mood === 'mad') {
    for (const [r, cols] of Object.entries(CHEEK_HOT)) {
      const row = parseInt(r, 10)
      for (const [c, v] of Object.entries(cols)) grid[row][parseInt(c, 10)] = v
    }
    for (const [r, cols] of Object.entries(BROW_MAD)) {
      const row = parseInt(r, 10)
      for (const [c, v] of Object.entries(cols)) grid[row][parseInt(c, 10)] = v
    }
    // 怒目：眼眶变细 + 眼白变黑
    grid[8][9] = 'D'; grid[8][14] = 'D'
    grid[9][9] = 'K'; grid[9][10] = 'K'; grid[9][14] = 'K'; grid[9][15] = 'K'
    grid[10][9] = 'K'; grid[10][10] = 'K'; grid[10][14] = 'K'; grid[10][15] = 'K'
    // 嘴也变怒（抿嘴）
    grid[13][10] = 'D'; grid[13][11] = 'D'; grid[13][12] = 'D'
    grid[14][10] = 'D'; grid[14][11] = 'D'; grid[14][12] = 'D'; grid[14][13] = 'D'
  }

  if (mood === 'focus') {
    for (const [r, cols] of Object.entries(BROW_FOCUS)) {
      const row = parseInt(r, 10)
      for (const [c, v] of Object.entries(cols)) grid[row][parseInt(c, 10)] = v
    }
  }

  if (mood === 'celebrate') {
    for (const [r, cols] of Object.entries(CHEEK_SOFT)) {
      const row = parseInt(r, 10)
      for (const [c, v] of Object.entries(cols)) grid[row][parseInt(c, 10)] = v === 'P' ? 'G' : v
    }
    // 星星闪烁
    if (frame % 2 === 0) {
      for (const [r, cols] of Object.entries(STARS)) {
        const row = parseInt(r, 10)
        for (const [c, v] of Object.entries(cols)) grid[row][parseInt(c, 10)] = v
      }
    }
    // 嘴变圆（开心）
    grid[14][11] = 'D'; grid[14][12] = 'D'
    grid[15][11] = 'W'; grid[15][12] = 'W'
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

export function PandaSVG({ mood, size = 48, className = '' }: Props) {
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
      <g className="px-wrapper">
        {renderRects(grid)}
      </g>
    </svg>
  )
}
