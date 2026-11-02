import { useState } from 'react'
import { useStore } from '../state/store'
import { useTodayKey } from '../hooks/useClock'
import { lastNDays } from '../core/date'
import { derivePetMood, petSays, PET_EMOJI, PET_CLASS, adjustTrust, type PetSnapshot } from '../core/pet'

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

  // 连续打卡：习惯连续每天有至少一次 count>0 的记录
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

/** 全局角落里的监督员猫。点它弹当日评价气泡。 */
export function SupervisorPet() {
  const { data, actions } = useStore()
  const today = useTodayKey()
  const [open, setOpen] = useState(false)
  const [justHit, setJustHit] = useState(false)
  const [lastHitCount, setLastHitCount] = useState(
    data.guardLogs.filter((l) => l.at.startsWith(today)).length,
  )

  // 监听新的破戒事件：刚发生一次 → 宠物变怒 3 秒
  const hitsToday = data.guardLogs.filter((l) => l.at.startsWith(today)).length
  if (hitsToday > lastHitCount) {
    setJustHit(true)
    setLastHitCount(hitsToday)
    // 好感度扣 5
    const trust = Number(data.settings.supervision.petTrust ?? 50)
    const next = adjustTrust(trust, 'guard_hit')
    actions.updateSettings({ supervision: { ...data.settings.supervision, petTrust: next } })
    window.setTimeout(() => setJustHit(false), 5000)
  }

  const snap = buildSnapshot(today, data, justHit)
  const [line, setLine] = useState(() => petSays(snap))

  const bubble = () => {
    setOpen(true)
    setLine(petSays(snap))
  }

  return (
    <>
      <button
        className="pet-trigger"
        onClick={bubble}
        aria-label="监督员"
        title="刻刻"
      >
        <span className={`pet-emoji ${PET_CLASS[snap.mood]}`}>{PET_EMOJI[snap.mood]}</span>
      </button>

      {open ? (
        <div className="pet-bubble" onClick={() => setOpen(false)}>
          <div className="pet-bubble-head">
            <span className={PET_CLASS[snap.mood]} style={{ fontSize: 22 }}>{PET_EMOJI[snap.mood]}</span>
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
      <div className={`focus-pet-emoji ${PET_CLASS[mood]}`}>{PET_EMOJI[mood]}</div>
      <div className="focus-pet-line" onClick={() => setLine(petSays({ ...snap, mood }))}>
        {line}
      </div>
      <div className="focus-pet-sub">
        今天已专注 {snap.focusMin} 分 · 破戒 {snap.guardHits} 次
      </div>
    </div>
  )
}
