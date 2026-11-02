/**
 * 刻刻 —— 手绘 SVG 熊猫。
 * 四种 mood 共用同一个 SVG，差异由 CSS class 驱动（动画 / 表情变形 / 滤镜）。
 * 零依赖：纯 SVG + 纯 CSS keyframes。
 */
import type { PetMood } from '../core/pet'

interface Props {
  mood: PetMood
  size?: number
  className?: string
}

export function PandaSVG({ mood, size = 48, className = '' }: Props) {
  return (
    <svg
      className={`panda-svg panda-${mood} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g className="pd-wrapper">
        {/* 耳朵 */}
        <g className="pd-ears">
          <circle className="pd-ear pd-ear-l" cx="22" cy="22" r="11" fill="#1a1a1a" />
          <circle className="pd-ear pd-ear-r" cx="78" cy="22" r="11" fill="#1a1a1a" />
        </g>

        {/* 身体 */}
        <g className="pd-body-group">
          <ellipse className="pd-body" cx="50" cy="80" rx="28" ry="17" fill="#1a1a1a" />
          <ellipse className="pd-belly" cx="50" cy="82" rx="18" ry="11" fill="#ffffff" />
        </g>

        {/* 头 */}
        <g className="pd-head">
          <circle className="pd-head-fill" cx="50" cy="46" r="30" fill="#ffffff" stroke="#1a1a1a" strokeWidth="1.2" />

          {/* 黑眼圈 */}
          <g className="pd-eye-patches">
            <ellipse className="pd-patch pd-patch-l" cx="36" cy="45" rx="8" ry="10" fill="#1a1a1a" transform="rotate(-18 36 45)" />
            <ellipse className="pd-patch pd-patch-r" cx="64" cy="45" rx="8" ry="10" fill="#1a1a1a" transform="rotate(18 64 45)" />
          </g>

          {/* 眉毛（mad 时下降） */}
          <g className="pd-brows">
            <path className="pd-brow pd-brow-l" d="M28 36 Q36 32 44 37" stroke="#1a1a1a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <path className="pd-brow pd-brow-r" d="M56 37 Q64 32 72 36" stroke="#1a1a1a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </g>

          {/* 眼睛 */}
          <g className="pd-eyes">
            <circle className="pd-eye pd-eye-l" cx="37" cy="46" r="3.2" fill="#ffffff" />
            <circle className="pd-eye pd-eye-r" cx="63" cy="46" r="3.2" fill="#ffffff" />
          </g>

          {/* 鼻子 */}
          <ellipse className="pd-nose" cx="50" cy="56" rx="3.5" ry="2.5" fill="#1a1a1a" />

          {/* 嘴巴 */}
          <path
            className="pd-mouth"
            d="M50 58 L50 62 M44 64 Q50 68 56 64"
            stroke="#1a1a1a"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
          />

          {/* 腮红（mad 时变红，idle/focus 时淡粉） */}
          <g className="pd-cheeks">
            <ellipse className="pd-cheek pd-cheek-l" cx="28" cy="56" rx="4" ry="2.5" fill="#ffb3b3" opacity="0.6" />
            <ellipse className="pd-cheek pd-cheek-r" cx="72" cy="56" rx="4" ry="2.5" fill="#ffb3b3" opacity="0.6" />
          </g>

          {/* 庆祝星星（celebrate 时浮现） */}
          <g className="pd-stars">
            <path className="pd-star pd-star-1" d="M18 32 l2 5 l5 0 l-4 3 l1 5 l-4 -3 l-4 3 l1 -5 l-4 -3 l5 0 z" fill="#ffd700" />
            <path className="pd-star pd-star-2" d="M82 34 l1.5 4 l4 0 l-3 2.5 l1 4 l-3.5 -2.5 l-3.5 2.5 l1 -4 l-3 -2.5 l4 0 z" fill="#ffd700" />
            <path className="pd-star pd-star-3" d="M50 10 l1.5 4 l4 0 l-3 2.5 l1 4 l-3.5 -2.5 l-3.5 2.5 l1 -4 l-3 -2.5 l4 0 z" fill="#ffd700" />
          </g>
        </g>
      </g>
    </svg>
  )
}
