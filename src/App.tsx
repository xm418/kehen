import { useEffect, useState } from 'react'
import { Icon, type IconName } from './components/Icons'
import { useStore } from './state/store'
import { formatFull, todayKey } from './core/date'
import { TodayPage } from './pages/Today'
import { HabitsPage } from './pages/Habits'
import { FocusPage } from './pages/Focus'
import { NotesPage } from './pages/Notes'
import { DocsPage } from './pages/Docs'
import { BillsPage } from './pages/Bills'
import { ReviewPage } from './pages/Review'
import { SettingsPage } from './pages/Settings'
import { SupervisionGate } from './components/SupervisionGate'
import { FocusNoteSheet } from './components/FocusNoteSheet'
import { PlanGate } from './components/PlanGate'
import { useWakeLock } from './hooks/useWakeLock'
import { applyBackupReminder, applyDailyReminder, notifyGuardHit } from './core/nativeNotify'
import { GUARD_LABEL, guardApp, readForeground } from './core/guard'

type TabKey = 'today' | 'habits' | 'focus' | 'notes' | 'docs' | 'bills' | 'review' | 'settings'

const NAV: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'today', label: '今日', icon: 'today' },
  { key: 'habits', label: '习惯', icon: 'habit' },
  { key: 'focus', label: '专注', icon: 'focus' },
  { key: 'notes', label: '记录', icon: 'note' },
  { key: 'docs', label: '文档', icon: 'doc' },
  { key: 'bills', label: '记账', icon: 'bill' },
  { key: 'review', label: '复盘', icon: 'chart' },
  { key: 'settings', label: '设置', icon: 'settings' },
]

export default function App() {
  const { data, ready, justFinished, actions, focusPrompt } = useStore()
  const [tab, setTabState] = useState<TabKey>(() => {
    const h = location.hash.replace('#', '')
    return NAV.some((n) => n.key === h) ? (h as TabKey) : 'today'
  })
  const [pendingTab, setPendingTab] = useState<TabKey | null>(null)

  const setTab = (next: TabKey) => {
    setTabState(next)
    history.replaceState(null, '', `#${next}`)
  }

  // 专注进行中：切页面前先确认，并保持屏幕常亮
  const focusLocked =
    data.settings.focus.lock && data.timer.running && data.timer.mode === 'focus'
  useWakeLock(data.settings.focus.keepAwake && data.timer.running && data.timer.mode === 'focus')

  const go = (next: TabKey) => {
    if (next === tab) return
    if (focusLocked) {
      setPendingTab(next)
      return
    }
    setTab(next)
  }

  const leaveFocus = () => {
    if (!pendingTab) return
    actions.noteInterruption()
    actions.pauseTimer()
    setTab(pendingTab)
    setPendingTab(null)
  }

  useEffect(() => {
    const onHash = () => {
      const h = location.hash.replace('#', '')
      if (!NAV.some((n) => n.key === h)) return
      // 直接改地址栏或按浏览器后退，同样要经过确认，不能绕开专注
      if (focusLocked && h !== 'focus') {
        setPendingTab(h as TabKey)
        setTabState('focus')
        history.replaceState(null, '', '#focus')
        return
      }
      setTabState(h as TabKey)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [focusLocked])

  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', data.settings.theme === 'dark' ? '#0b0b0b' : '#f6f6f4')
  }, [data.settings.theme])

  // 装成 APK 时：按截止时间排一条每天重复的本地通知（网页端自动跳过）
  useEffect(() => {
    void applyDailyReminder(data.settings.supervision.deadlineHour)
  }, [data.settings.supervision.deadlineHour])

  // 超过 7 天没导出备份就提醒一次；导出后自动改期
  useEffect(() => {
    void applyBackupReminder(data.settings.backup.enabled, data.settings.backup.lastExportedAt)
  }, [data.settings.backup.enabled, data.settings.backup.lastExportedAt])

  // 专注进行中：每 30 秒看一眼前台应用，命中娱乐类就记一笔并弹通知
  const guardActive =
    data.settings.guard.enabled && data.timer.running && data.timer.mode === 'focus'
  const guardCfg = data.settings.guard
  useEffect(() => {
    if (!guardActive) return
    let stopped = false
    const tick = async () => {
      const fg = await readForeground()
      if (stopped || !fg) return
      const app = guardApp(fg.pkg)
      if (!app || !guardCfg[app.category]) return
      // 刚切进来不算，真待上 20 秒才记
      if (fg.seconds < 20) return
      actions.logGuardHit({
        pkg: app.pkg,
        appName: app.name,
        category: app.category,
        seconds: fg.seconds,
      })
      void notifyGuardHit(app.name, GUARD_LABEL[app.category])
    }
    void tick()
    const id = window.setInterval(() => void tick(), 30000)
    return () => {
      stopped = true
      window.clearInterval(id)
    }
  }, [guardActive, guardCfg, actions])

  if (!ready) return <div className="page" />

  const current = NAV.find((n) => n.key === tab)!

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">痕</div>
          <div>
            <span className="brand-name">刻痕</span>
            <span className="brand-sub">自律 · 学习记录</span>
          </div>
        </div>

        <nav className="sidenav">
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`sidenav-item${tab === n.key ? ' active' : ''}`}
              onClick={() => go(n.key)}
            >
              <Icon name={n.icon} size={17} />
              {n.label}
              <span className="dot" style={{ marginLeft: 'auto' }} />
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="eyebrow">今天</div>
          <div className="num">{formatFull(todayKey())}</div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, paddingLeft: 0 }} onClick={() => actions.updateSettings({ theme: data.settings.theme === 'dark' ? 'light' : 'dark' })}>
            {data.settings.theme === 'dark' ? '切换浅色' : '切换深色'}
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="mobile-head">
          <h1>{current.label}</h1>
          <button
            className="icon-btn"
            aria-label="切换主题"
            onClick={() => actions.updateSettings({ theme: data.settings.theme === 'dark' ? 'light' : 'dark' })}
          >
            <Icon name="settings" size={17} />
          </button>
        </header>

        <div className="page">
          {tab === 'today' && <TodayPage goTo={go} />}
          {tab === 'habits' && <HabitsPage />}
          {tab === 'focus' && <FocusPage />}
          {tab === 'notes' && <NotesPage />}
          {tab === 'docs' && <DocsPage />}
          {tab === 'bills' && <BillsPage />}
          {tab === 'review' && <ReviewPage />}
          {tab === 'settings' && <SettingsPage />}
        </div>
      </main>

      <nav className="tabbar">
        {NAV.map((n) => (
          <button
            key={n.key}
            className={`tab-item${tab === n.key ? ' active' : ''}`}
            onClick={() => go(n.key)}
          >
            <Icon name={n.icon} size={20} />
            {n.label}
          </button>
        ))}
      </nav>

      {justFinished ? (
        <div className="toast">{justFinished === 'focus' ? '这一段专注完成，休息一下' : '休息结束，继续'}</div>
      ) : null}

      {pendingTab ? (
        <div className="gate-backdrop" role="dialog" aria-modal="true">
          <div className="gate" style={{ maxWidth: 360 }}>
            <div className="gate-head">
              <div className="gate-mark">专注</div>
              <div>
                <div className="gate-title">这段还没结束</div>
                <div className="card-sub">离开会把计时暂停，并记一次中断</div>
              </div>
            </div>
            <div className="stack" style={{ gap: 8, marginTop: 18 }}>
              <button className="btn btn-primary" onClick={() => setPendingTab(null)}>
                继续专注
              </button>
              <button className="btn" onClick={leaveFocus}>
                中断并离开
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SupervisionGate />
      <PlanGate />

      {focusPrompt ? <FocusNoteSheet session={focusPrompt} /> : null}
    </div>
  )
}
