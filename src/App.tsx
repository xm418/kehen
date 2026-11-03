import { useEffect, useState } from 'react'
import { Icon, type IconName } from './components/Icons'
import { useStore } from './state/store'
import { formatFull, todayKey } from './core/date'
import { TodayPage } from './pages/Today'
import { HabitsPage } from './pages/Habits'
import { FocusPage } from './pages/Focus'
import { NotesPage } from './pages/Notes'
import { WordsPage } from './pages/Words'
import { BillsPage } from './pages/Bills'
import { ReviewPage } from './pages/Review'
import { SettingsPage } from './pages/Settings'
import { SupervisionGate } from './components/SupervisionGate'
import { SupervisorPet } from './components/SupervisorPet'
import { FocusNoteSheet } from './components/FocusNoteSheet'
import { PlanGate } from './components/PlanGate'
import { useWakeLock } from './hooks/useWakeLock'
import { applyBackupReminder, notifyGuardHit, scheduleAllReminders } from './core/nativeNotify'
import { GUARD_LABEL, guardApp, readForeground } from './core/guard'
import { applySystemBars } from './core/systemBars'

type TabKey = 'today' | 'habits' | 'focus' | 'notes' | 'words' | 'bills' | 'review' | 'settings'

// 底部导航固定一行七个；设置改走右上角齿轮，不占 tab
const NAV: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'today', label: '今日', icon: 'today' },
  { key: 'habits', label: '习惯', icon: 'habit' },
  { key: 'focus', label: '专注', icon: 'focus' },
  { key: 'notes', label: '记录', icon: 'note' },
  { key: 'words', label: '单词', icon: 'word' },
  { key: 'bills', label: '记账', icon: 'bill' },
  { key: 'review', label: '复盘', icon: 'chart' },
]

const SETTINGS_TAB: { key: TabKey; label: string; icon: IconName } = {
  key: 'settings',
  label: '设置',
  icon: 'settings',
}

function isTabKey(h: string): h is TabKey {
  return h === 'settings' || NAV.some((n) => n.key === h)
}

/** 原生 splash 还盖在上面；WebView 里先跑一个轻量 loading，保证 ready=true 时直接有内容可显示 */
function AppLoading() {
  return (
    <div className="app-loading" aria-hidden="true">
      <div className="app-loading-mark" />
      <div className="app-loading-label">刻痕</div>
    </div>
  )
}

export default function App() {
  const { data, ready, justFinished, actions, focusPrompt } = useStore()
  const [tab, setTabState] = useState<TabKey>(() => {
    const h = location.hash.replace('#', '')
    return isTabKey(h) ? h : 'today'
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
      if (!isTabKey(h)) return
      // 直接改地址栏或按浏览器后退，同样要经过确认，不能绕开专注
      if (focusLocked && h !== 'focus') {
        setPendingTab(h as TabKey)
        setTabState('focus')
        history.replaceState(null, '', '#focus')
        return
      }
      setTabState(h)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [focusLocked])

  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', data.settings.theme === 'dark' ? '#0a0a0a' : '#f6f6f4')
    // APK 里系统状态栏/手势条不在网页控制范围，要单独通知原生
    void applySystemBars(data.settings.theme === 'dark')
  }, [data.settings.theme])

  // 装成 APK 时：启动即排好未来 7 天的 4 条每日提醒；习惯/计划/债务/截止时间变了都重建
  useEffect(() => {
    if (!ready) return
    void scheduleAllReminders(data, 7)
  }, [
    ready,
    data.settings.supervision.deadlineHour,
    data.habits.length,
    data.debts.length,
    data.remedials.length,
    data.plans.length,
  ])

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

  if (!ready) return <AppLoading />

  const current = NAV.find((n) => n.key === tab) ?? SETTINGS_TAB

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
          <div className="row" style={{ marginTop: 8, gap: 4 }}>
            <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => actions.updateSettings({ theme: data.settings.theme === 'dark' ? 'light' : 'dark' })}>
              {data.settings.theme === 'dark' ? '切换浅色' : '切换深色'}
            </button>
            <button
              className={`icon-btn${tab === 'settings' ? ' active' : ''}`}
              style={tab === 'settings' ? { color: 'var(--text)', background: 'var(--surface-2)' } : undefined}
              aria-label="设置"
              onClick={() => go('settings')}
            >
              <Icon name="settings" size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="mobile-head">
          <h1>{current.label}</h1>
          <div className="row" style={{ gap: 2 }}>
            <button
              className="icon-btn"
              aria-label="切换主题"
              onClick={() => actions.updateSettings({ theme: data.settings.theme === 'dark' ? 'light' : 'dark' })}
            >
              <Icon name="theme" size={17} />
            </button>
            <button className="icon-btn" aria-label="设置" onClick={() => go('settings')}>
              <Icon name="settings" size={17} />
            </button>
          </div>
        </header>

        <div className="page">
          {tab === 'today' && <TodayPage goTo={go} />}
          {tab === 'habits' && <HabitsPage />}
          {tab === 'focus' && <FocusPage />}
          {tab === 'notes' && <NotesPage />}
          {tab === 'words' && <WordsPage />}
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
      <SupervisorPet />

      {focusPrompt ? <FocusNoteSheet session={focusPrompt} /> : null}
    </div>
  )
}
