/**
 * 刻刻（像素版）—— 24×24 像素网格渲染的手绘熊猫。
 * 调色板:
 *   . 透明   K 黑毛(#1a1a1a)   W 白底(#fff)   D 深灰(#2a2a2a)
 *   R 红眼(#c00)   G 金星(#ffd700)   P 粉腮红(#ffb3b3)
 *
 * mood 差异 = 基础帧 + 表情叠层（眉毛、腮红、眼睛位置）。
 */
import type { PetMood } from '../core/pet'

const SIZE = 24 // 24×24 网格
const PX = 1    // 每格 1 unit，viewBox 里再放大

type Cell = '.' | 'K' | 'W' | 'D' | 'R' | 'G' | 'P'

const BASE: string[] = [
  // 0  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 21 22 23
  '........................', // 0
  '........................', // 1
  '....KK......KK..........', // 2  耳朵顶
  '...KKKK....KKKK.........', // 3
  '..KKKKKKKKKKKKKK........', // 4  耳朵下 + 头顶黑
  '.KKKKWWWWWWWWWWKKK......', // 5  头顶过渡
  '..KWWWWWWWWWWWWWWWK.....', // 6  脸部上沿
  '..KWWKKKKWWWWKKKKWWK....', // 7  黑眼圈出现
  '..KWKKKKKKWWKKKKKKWK....', // 8  黑眼圈完整
  '..KWKKKKKKWWKKKKKKWK....', // 9
  '..KWKKWKKKWWKKKWKKWK....', // 10 眼睛在黑眼圈内
  '..KWKKKKKKWWKKKKKKWK....', // 11
  '..KWWKKKKWWWWKKKKWWK....', // 12
  '..KWWWWWWWKWWWWWWWK.....', // 13
  '..KWWWWWKKKKKWWWWWK.....', // 14
  '..KKWWWWWWWWWKKKKK......', // 15  脖子黑过渡
  '...KKWWWWWWWKKK.........', // 16
  '....KKKKKKKKK...........', // 17  身体黑开始
  '....KWWWWWWWK...........', // 18  肚皮白
  '....KWWWWWWWK...........', // 19
  '....KWWWWWWWK...........', // 20
  '....KKKKKKKKK...........', // 21  身体底
  '........................', // 22
  '........................', // 23
]

// —— 嘴巴区域覆盖（鼻孔 + 嘴）
const MOUTH: Record<number, Record<number, Cell>> = {
  13: { 11: 'D', 12: 'D' },              // 鼻孔
  14: { 10: 'D', 11: 'D', 12: 'D', 13: 'D' }, // 上唇
  15: { 11: 'D', 12: 'D' },              // 唇中央
}

// —— 眼睛：idle 正常眼珠位置
const EYE_IDLE: Record<number, Record<number, Cell>> = {
  10: { 9: 'W', 10: 'W', 13: 'W', 14: 'W' }, // 白眼
  11: { 9: 'W', 10: 'W', 13: 'W', 14: 'W' },
}

// —— 腮红（idle/focus）
const CHEEK_SOFT: Record<number, Record<number, Cell>> = {
  12: { 6: 'P', 7: 'P', 16: 'P', 17: 'P' },
  13: { 6: 'P', 7: 'P', 16: 'P', 17: 'P' },
}

// —— 腮红（mad 变红）
const CHEEK_HOT: Record<number, Record<number, Cell>> = {
  12: { 6: 'R', 7: 'R', 16: 'R', 17: 'R' },
  13: { 6: 'R', 7: 'R', 16: 'R', 17: 'R' },
}

// —— 眉毛（mad 下压变红）
const BROW_MAD: Record<number, Record<number, Cell>> = {
  6: { 8: 'R', 9: 'R', 14: 'R', 15: 'R' },
  7: { 7: 'R', 16: 'R' },
}

// —— 眉毛（focus 平直）
const BROW_FOCUS: Record<number, Record<number, Cell>> = {
  6: { 8: 'D', 9: 'D', 14: 'D', 15: 'D' },
}

// —— 庆祝星星（三帧闪烁）
const STARS: Record<number, Record<number, Cell>> = {
  1: { 5: 'G', 18: 'G' },
  2: { 11: 'G', 12: 'G' },
}

const PALETTE: Record<string, string> = {
  K: '#1a1a1a',
  W: '#ffffff',
  D: '#2a2a2a',
  R: '#c00000',
  G: '#ffd700',
  P: '#ffb3b3',
}

function buildGrid(mood: PetMood, frame: number): string[][] {
  const grid: string[][] = BASE.map((row) => row.split(''))

  // 覆盖嘴巴
  for (const [r, cols] of Object.entries(MOUTH)) {
    const row = parseInt(r, 10)
    for (const [c, v] of Object.entries(cols)) {
      grid[row][parseInt(c, 10)] = v
    }
  }

  // 覆盖眼睛
  for (const [r, cols] of Object.entries(EYE_IDLE)) {
    const row = parseInt(r, 10)
    for (const [c, v] of Object.entries(cols)) {
      grid[row][parseInt(c, 10)] = v
    }
  }

  if (mood === 'idle' || mood === 'focus') {
    for (const [r, cols] of Object.entries(CHEEK_SOFT)) {
      const row = parseInt(r, 10)
      for (const [c, v] of Object.entries(cols)) {
        grid[row][parseInt(c, 10)] = v
      }
    }
  }

  if (mood === 'mad') {
    for (const [r, cols] of Object.entries(CHEEK_HOT)) {
      const row = parseInt(r, 10)
      for (const [c, v] of Object.entries(cols)) {
        grid[row][parseInt(c, 10)] = v
      }
    }
    for (const [r, cols] of Object.entries(BROW_MAD)) {
      const row = parseInt(r, 10)
      for (const [c, v] of Object.entries(cols)) {
        grid[row][parseInt(c, 10)] = v
      }
    }
    // 眼睛变细（怒目）
    grid[10][9] = 'D'; grid[10][10] = 'D'
    grid[10][13] = 'D'; grid[10][14] = 'D'
    grid[11][9] = 'K'; grid[11][10] = 'K'
    grid[11][13] = 'K'; grid[11][14] = 'K'
  }

  if (mood === 'focus') {
    for (const [r, cols] of Object.entries(BROW_FOCUS)) {
      const row = parseInt(r, 10)
      for (const [c, v] of Object.entries(cols)) {
        grid[row][parseInt(c, 10)] = v
      }
    }
  }

  if (mood === 'celebrate') {
    for (const [r, cols] of Object.entries(CHEEK_SOFT)) {
      const row = parseInt(r, 10)
      for (const [c, v] of Object.entries(cols)) {
        grid[row][parseInt(c, 10)] = v === 'P' ? 'G' : v
      }
    }
    // 星星两帧闪烁
    const starFrame = frame % 2
    if (starFrame === 0) {
      for (const [r, cols] of Object.entries(STARS)) {
        const row = parseInt(r, 10)
        for (const [c, v] of Object.entries(cols)) {
          grid[row][parseInt(c, 10)] = v
        }
      }
    }
  }

  return grid
}

function renderRects(grid: string[][], offset = 0) {
  const rects: React.ReactElement[] = []
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c]
      if (cell === '.' || !PALETTE[cell]) continue
      rects.push(
        <rect
          key={`${r}-${c}-${offset}`}
          x={c + offset}
          y={r}
          width={PX}
          height={PX}
          fill={PALETTE[cell]}
        />,
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

/**
 * 像素熊猫刻刻。24×24 网格，shape-rendering=crispEdges 保证硬边。
 * 动画全由外层 CSS keyframes 驱动（.px-wrapper transform），
 * 内部只负责把 mood 帧渲染成 rect 元素。
 */
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
