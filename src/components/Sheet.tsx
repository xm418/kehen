import type { ReactNode } from 'react'

export function Sheet({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="sheet">
        <div className="row-between" style={{ marginBottom: 16, alignItems: 'flex-start' }}>
          <div>
            <h3 className="card-title" style={{ fontSize: 17 }}>
              {title}
            </h3>
            {subtitle ? <div className="card-sub">{subtitle}</div> : null}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button
          key={o.value}
          className={`pill${value === o.value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
