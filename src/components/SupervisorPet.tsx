import { useState, useRef, useCallback, useEffect } from 'react'
import { useStore } from '../state/store'
import { useTodayKey } from '../hooks/useClock'
import { lastNDays } from '../core/date'
import { derivePetMood, petSays, adjustTrust, type PetSnapshot } from '../core/pet'
import { PandaSVG } from './PandaSVG'

// ---------- 拖拽位置 ----------
const POS_KEY = 'pet-trigger-pos-v1'
interface PetPos { x: number; y: number }

function loadPos(): PetPos | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (typeof p.x === 'number' && typeof p.y === 'number') return p
  } catch {}
  return null
}

function savePos(p: PetPos) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)) } catch {}
}

/** 默认位置：右下角（对应原 CSS 的 right:14px, bottom:84px） */
function defaultPos(): PetPos {
  if (typeof window === 'undefined') return { x: 300, y: 400 }
  const SAFE_BOTTOM = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-bottom)'),
  ) || 0
  return {
    x: window.innerWidth - 14 - 56,
    y: window.innerHeight - 84 - 56 - SAFE_BOTTOM,
  }
}

// ---------- 计算快照 ----------
function buildSnapshot(today: string, data: ReturnType<typeof useStore>['data'], guardJustNow: boolean): PetSnapshot {
  const days = lastNDays(14, today)
  const focusMin = data.sessions
    .filter((s) => s.mode === 'focus' && s.startedAt.startsWith(today))
    .reduce((a, s) => a + s.minutes, 0)
  const todayHabits = data.habitLogs.filter((l) => l.date === today)
  const habitRate = data.habits.length === 0 ? 0 : todayHabits.filter((l) => l.count > 0).length / data.habits.length
  const cleanSessions = data.sessions.filter(
    (s) => s.mode === 'focus' && s.startedAt.startsWith(today) && (s.interruptions ?? 0) === 0,
  ).length

  let streak = 0
  for (const d of days) {
    const logs = data.habitLogs.filter((l) => l.date === d && l.count > 0)
    if (logs.length === 0) break
    streak++
  }

  const trustRaw = Number(data.settings.supervision.petTrust ?? 50)
  const guardHits = data.guardLogs.filter((l) => l.at.startsWith(today)).length

  const base = {
    trust: Number.isFinite(trustRaw) ? trustRaw : 50,
    focusMin,
    guardHits,
    habitRate,
    cleanSessions,
    streak,
  }
  const mood = derivePetMood(base, data.timer.running, guardJustNow)
  return { ...base, mood }
}

/** 全局角落里的监督员宠物，可拖拽。点（非拖）弹当日评价气泡。 */
export function SupervisorPet() {
  const { data, actions } = useStore()
  const today = useTodayKey()
  const [open, setOpen] = useState(false)
  const [justHit, setJustHit] = useState(false)
  const [lastHitCount, setLastHitCount] = useState(
    data.guardLogs.filter((l) => l.at.startsWith(today)).length,
  )

  // 拖拽位置
  const [pos, setPos] = useState<PetPos>(() => loadPos() ?? defaultPos())

  // 先算快照（后面 callbacks 要用）
  const snap = buildSnapshot(today, data, justHit)
  const [line, setLine] = useState(() => petSays(snap))

  // 窗口 resize 时重新 clamp
  useEffect(() => {
    const clamp = () => {
      setPos((prev) => ({
        x: Math.max(0, Math.min(prev.x, window.innerWidth - 56)),
        y: Math.max(0, Math.min(prev.y, window.innerHeight - 56)),
      }))
    }
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [])

  // 拖拽状态
  const dragging = useRef(false)
  const dragStart = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const movedFar = useRef(false)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    movedFar.current = false
    dragStart.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [pos])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !dragStart.current) return
    const dx = e.clientX - dragStart.current.px
    const dy = e.clientY - dragStart.current.py
    if (Math.abs(dx) + Math.abs(dy) > 4) movedFar.current = true
    const nx = Math.max(0, Math.min(dragStart.current.x + dx, window.innerWidth - 56))
    const ny = Math.max(0, Math.min(dragStart.current.y + dy, window.innerHeight - 56))
    setPos({ x: nx, y: ny })
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    dragStart.current = null
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
    savePos(pos)
  }, [pos])

  // 点击（非拖拽）时才开气泡
  const onClick = useCallback(() => {
    if (movedFar.current) return
    setLine(petSays(snap))
    setOpen(true)
  }, [snap])

  // 破戒事件监听
  const hitsToday = data.guardLogs.filter((l) => l.at.startsWith(today)).length
  if (hitsToday > lastHitCount) {
    setJustHit(true)
    setLastHitCount(hitsToday)
    const trust = Number(data.settings.supervision.petTrust ?? 50)
    const next = adjustTrust(trust, 'guard_hit')
    actions.updateSettings({ supervision: { ...data.settings.supervision, petTrust: next } })
    window.setTimeout(() => setJustHit(false), 5000)
  }

  // 气泡位置：在宠物上方居中，如果靠边就自动翻边
  const petCX = pos.x + 28
  const bubbleW = 260
  const bubbleH = 140
  let bubbleX = petCX - bubbleW / 2
  let bubbleY = pos.y - bubbleH - 12
  if (bubbleX < 8) bubbleX = 8
  if (bubbleX + bubbleW > window.innerWidth - 8) bubbleX = window.innerWidth - bubbleW - 8
  if (bubbleY < 8) bubbleY = pos.y + 70 // 翻到下方
  const bubbleArrowRight = Math.max(12, Math.min(bubbleW - 12, petCX - bubbleX))
  const arrowOnTop = bubbleY < pos.y // 气泡在宠物上方

  return (
    <>
      <button
        className="pet-trigger"
        style={{
          left: pos.x,
          top: pos.y,
          right: 'auto',
          bottom: 'auto',
          touchAction: 'none', // 禁止浏览器手势，让 pointer 事件接管
          cursor: dragging.current ? 'grabbing' : 'grab',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        aria-label="监督员"
        title="刻刻（可拖拽）"
      >
        <PandaSVG mood={snap.mood} size={48} className="pet-svg" />
      </button>

      {open ? (
        <div
          className="pet-bubble"
          style={{
            left: bubbleX,
            top: bubbleY,
            right: 'auto',
            bottom: 'auto',
          }}
          onClick={() => setOpen(false)}
        >
          {/* 箭头 */}
          <div
            className="pet-bubble-arrow"
            style={{
              ...(arrowOnTop
                ? { top: -6, transform: 'rotate(45deg)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }
                : { bottom: -6, transform: 'rotate(-135deg)', borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)' }),
              left: bubbleArrowRight,
            }}
          />
          <div className="pet-bubble-head">
            <PandaSVG mood={snap.mood} size={32} className="pet-bubble-svg" />
            <span className="pet-name">刻刻</span>
            <span className="pet-trust">信任 {snap.trust}</span>
          </div>
          <div className="pet-line">{line}</div>
          <div className="pet-stats">
            <span>今天专注 {snap.focusMin} 分</span>
            <span>·</span>
            <span>习惯完成 {Math.round(snap.habitRate * 100)}%</span>
            <span>·</span>
            <span>连签 {snap.streak} 天</span>
            {snap.guardHits > 0 ? <span>· 破戒 {snap.guardHits} 次</span> : null}
          </div>
        </div>
      ) : null}
    </>
  )
}

/** 专注页里的大号监督员。timer running 时显示，怒了就变😤。 */
export function FocusSupervisor() {
  const { data } = useStore()
  const today = useTodayKey()
  const [justHit, setJustHit] = useState(false)
  const [lastHitCount, setLastHitCount] = useState(
    data.guardLogs.filter((l) => l.at.startsWith(today)).length,
  )
  const [line, setLine] = useState('我在这儿守着。')

  const hitsToday = data.guardLogs.filter((l) => l.at.startsWith(today)).length
  if (hitsToday > lastHitCount) {
    setJustHit(true)
    setLastHitCount(hitsToday)
    setLine(petSays({ trust: 0, focusMin: 0, guardHits: hitsToday, habitRate: 0, cleanSessions: 0, streak: 0, mood: 'mad' }))
    window.setTimeout(() => setJustHit(false), 5000)
  }

  if (!data.timer.running || data.timer.mode !== 'focus') return null

  const snap = buildSnapshot(today, data, justHit)
  const mood = justHit ? 'mad' : 'focus'

  return (
    <div className="focus-pet">
      <PandaSVG mood={mood} size={80} className="focus-pet-svg" />
      <div className="focus-pet-line" onClick={() => setLine(petSays({ ...snap, mood }))}>
        {line}
      </div>
      <div className="focus-pet-sub">
        今天已专注 {snap.focusMin} 分 · 破戒 {snap.guardHits} 次
      </div>
    </div>
  )
}
