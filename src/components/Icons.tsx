import type { ReactElement } from 'react'

// 极简线性图标，统一 20×20 视觉尺寸
export type IconName =
  | 'today'
  | 'habit'
  | 'focus'
  | 'note'
  | 'bill'
  | 'chart'
  | 'plus'
  | 'check'
  | 'close'
  | 'trash'
  | 'play'
  | 'pause'
  | 'reset'
  | 'chevron'
  | 'download'
  | 'settings'

const PATHS: Record<IconName, ReactElement> = {
  today: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 3.4v2M12 18.6v2M3.4 12h2M18.6 12h2" />
    </>
  ),
  habit: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <path d="M8 12.4l2.6 2.6 5.4-5.6" />
    </>
  ),
  focus: (
    <>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9v4.2l2.6 1.8M9.2 3.6h5.6" />
    </>
  ),
  note: (
    <>
      <path d="M5 4.6h11.2a2 2 0 012 2v12.8H7a2 2 0 01-2-2z" />
      <path d="M5 16.4h13.2M8.6 8.4h6.2M8.6 12h4.4" />
    </>
  ),
  chart: (
    <>
      <path d="M4.6 20V13M10.6 20V8.4M16.6 20V4.6" />
      <path d="M3 20h18" />
    </>
  ),
  bill: (
    <>
      <path d="M5.4 4.6h13.2v15.2l-2.2-1.5-2.2 1.5-2.2-1.5-2.2 1.5-2.2-1.5z" />
      <path d="M9 9.2h6M9 12.6h4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.6l4.6 4.6L19 6.6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V4.6h5v2.4M6.6 7l1 12.4h8.8l1-12.4" />
    </>
  ),
  play: <path d="M8 5.2l11 6.8-11 6.8z" />,
  pause: <path d="M9 5.5v13M15 5.5v13" />,
  reset: (
    <>
      <path d="M4.4 12a7.6 7.6 0 1 0 2.6-5.7" />
      <path d="M4 4.6v4.6h4.6" />
    </>
  ),
  chevron: <path d="M10 6l6 6-6 6" />,
  download: (
    <>
      <path d="M12 3.6v11M7.4 10.6L12 15l4.6-4.4" />
      <path d="M4.6 17.4v2h14.8v-2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.6v2.2M12 18.2v2.2M3.6 12h2.2M18.2 12h2.2M6.1 6.1l1.5 1.5M16.4 16.4l1.5 1.5M17.9 6.1l-1.5 1.5M7.6 16.4l-1.5 1.5" />
    </>
  ),
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
