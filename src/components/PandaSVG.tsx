/**
 * 刻刻 —— 一只圆滚滚的熊猫脸。
 * 纯矢量 SVG：白脸 + 黑圆耳 + 黑眼圈 + 眼白黑瞳 + 小鼻 + 嘴 + 腮红。
 * mood 只改表情（眉毛 / 眼睛 / 嘴），不改脸型。
 */
import type { PetMood } from '../core/pet'

const INK = '#1c1c1c'
const FACE = '#ffffff'
const BLUSH = '#ffb2bb'
const BROW_MAD = '#dc3737'
const BROW_FOCUS = '#4a4a48'

interface Props {
  mood: PetMood
  size?: number
  className?: string
}

export function PandaSVG({ mood, size = 52, className = '' }: Props) {
  const happy = mood === 'celebrate'
  const brow = mood === 'mad' ? BROW_MAD : mood === 'focus' ? BROW_FOCUS : null

  return (
    <svg
      className={`panda-px panda-px-${mood} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g className="px-wrapper">
        {/* 耳朵（画在脸后面） */}
        <circle cx="17.2" cy="16.6" r="9.6" fill={INK} />
        <circle cx="46.8" cy="16.6" r="9.6" fill={INK} />

        {/* 脸 */}
        <ellipse
          cx="32"
          cy="34.5"
          rx="25"
          ry="24"
          fill={FACE}
          stroke="rgba(16,16,16,0.10)"
          strokeWidth="1"
        />

        {/* 黑眼圈 */}
        <ellipse cx="22.4" cy="35.4" rx="8.2" ry="9.5" transform="rotate(-16 22.4 35.4)" fill={INK} />
        <ellipse cx="41.6" cy="35.4" rx="8.2" ry="9.5" transform="rotate(16 41.6 35.4)" fill={INK} />

        {/* 眼睛：celebrate 换成弯弯笑眼 */}
        {happy ? (
          <g stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" fill="none">
            <path d="M18.4 36 Q22.4 31.2 26.4 36" />
            <path d="M37.6 36 Q41.6 31.2 45.6 36" />
          </g>
        ) : (
          <>
            <circle cx="22.4" cy="34.8" r="4" fill="#ffffff" />
            <circle cx="41.6" cy="34.8" r="4" fill="#ffffff" />
            <circle cx="22.4" cy="34.9" r="2.1" fill={INK} />
            <circle cx="41.6" cy="34.9" r="2.1" fill={INK} />
            <circle cx="23.4" cy="33.9" r="0.85" fill="#ffffff" />
            <circle cx="42.6" cy="33.9" r="0.85" fill="#ffffff" />
          </>
        )}

        {/* 眉毛（mad 红、focus 深灰） */}
        {brow ? (
          <g stroke={brow} strokeWidth="2.6" strokeLinecap="round">
            <path d="M15.6 21.2 L25.4 24.6" />
            <path d="M48.4 21.2 L38.6 24.6" />
          </g>
        ) : null}

        {/* 鼻子 */}
        <ellipse cx="32" cy="45.6" rx="3.7" ry="2.7" fill={INK} />

        {/* 嘴 */}
        {happy ? (
          <path d="M26.8 49.4 Q32 58.6 37.2 49.4 Z" fill={INK} />
        ) : mood === 'mad' ? (
          <path
            d="M27.8 51.8 Q32 47.8 36.2 51.8"
            stroke={INK}
            strokeWidth="1.7"
            strokeLinecap="round"
            fill="none"
          />
        ) : mood === 'focus' ? (
          <path d="M29.4 50.6 H34.6" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />
        ) : (
          <g stroke={INK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M32 48.4 V50.2" />
            <path d="M32 50.2 Q28.9 53.4 26.3 50.6" />
            <path d="M32 50.2 Q35.1 53.4 37.7 50.6" />
          </g>
        )}

        {/* 腮红 */}
        <ellipse cx="14.9" cy="43.8" rx="4.4" ry="2.8" fill={BLUSH} opacity="0.9" />
        <ellipse cx="49.1" cy="43.8" rx="4.4" ry="2.8" fill={BLUSH} opacity="0.9" />
      </g>
    </svg>
  )
}
