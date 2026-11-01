import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { Field } from './Sheet'
import { addDays, todayKey } from '../core/date'
import { isNativeApp } from '../core/nativeNotify'
import { GUARD_LABEL, openUsageSettings, usageAccessGranted } from '../core/guard'
import type { GuardCategory } from '../core/types'

const CATS: GuardCategory[] = ['video', 'game', 'novel']

export function GuardPanel() {
  const { data, actions } = useStore()
  const guard = data.settings.guard
  const [granted, setGranted] = useState(false)
  const [checking, setChecking] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const refresh = async () => {
    setChecking(true)
    setGranted(await usageAccessGranted())
    setChecking(false)
  }

  useEffect(() => {
    void refresh()
  }, [])

  const weekStart = addDays(todayKey(), -6)
  const weekLogs = data.guardLogs.filter((g) => g.date >= weekStart)
  const minutes = Math.round(weekLogs.reduce((sum, g) => sum + g.seconds, 0) / 60)
  const top = weekLogs.reduce<Record<string, number>>((acc, g) => {
    acc[g.appName] = (acc[g.appName] ?? 0) + 1
    return acc
  }, {})
  const topName = Object.entries(top).sort((a, b) => b[1] - a[1])[0]

  return (
    <section className="card" style={{ marginBottom: 12 }}>
      <div className="card-head">
        <div>
          <h3 className="card-title">娱乐戒断</h3>
          <div className="card-sub">
            专注计时进行中，盯着手机前台：刷视频、打游戏、看小说就弹通知并记一笔
          </div>
        </div>
      </div>

      <div className="stack">
        <label className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
          <input
            type="checkbox"
            checked={guard.enabled}
            onChange={(e) => actions.updateSettings({ guard: { ...guard, enabled: e.target.checked } })}
          />
          专注期间打开监控
        </label>

        <Field label="盯住哪几类">
          <div className="row" style={{ gap: 8 }}>
            {CATS.map((c) => (
              <button
                key={c}
                className={`pill${guard[c] ? ' active' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => actions.updateSettings({ guard: { ...guard, [c]: !guard[c] } })}
              >
                {GUARD_LABEL[c]}
              </button>
            ))}
          </div>
        </Field>

        {isNativeApp() ? (
          <div className="row-between" style={{ alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7 }}>
              {granted
                ? '已拿到「使用情况访问」权限，可以正常监控'
                : '还没授权：系统不允许应用看别的 App，监控不会生效'}
            </div>
            <button
              className="btn btn-sm"
              onClick={() => {
                if (granted) {
                  void refresh()
                  return
                }
                void openUsageSettings()
              }}
            >
              {checking ? '检查中…' : granted ? '重新检查' : '去授权'}
            </button>
          </div>
        ) : (
          <div className="card-sub" style={{ lineHeight: 1.8 }}>
            网页版读不到手机正在用什么 App，这段功能只在安装包（APK）里生效。
          </div>
        )}

        <div className="metric-row">
          <div className="metric">
            <div className="metric-value">{weekLogs.length}</div>
            <div className="metric-label">本周破戒</div>
          </div>
          <div className="metric">
            <div className="metric-value">{minutes}</div>
            <div className="metric-label">累计分钟</div>
          </div>
          <div className="metric">
            <div className="metric-value">{topName ? topName[0].slice(0, 4) : '—'}</div>
            <div className="metric-label">最常中招</div>
          </div>
        </div>

        {data.guardLogs.length === 0 ? (
          <div className="card-sub">还没有记录。真被记下来的时候，这里会出现应用名和时间。</div>
        ) : (
          <>
            <div className="row-between">
              <div className="eyebrow">破戒记录</div>
              <div className="row" style={{ gap: 6 }}>
                {data.guardLogs.length > 5 ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? '收起' : `查看全部（${data.guardLogs.length}）`}
                  </button>
                ) : null}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (confirm('清空全部破戒记录？')) actions.clearGuardLogs()
                  }}
                >
                  清空
                </button>
              </div>
            </div>
            <div className="stack" style={{ gap: 6, maxHeight: showAll ? 360 : undefined, overflowY: showAll ? 'auto' : undefined }}>
              {(showAll ? data.guardLogs : data.guardLogs.slice(0, 5)).map((g) => (
                <div className="row-between" key={g.id} style={{ fontSize: 12.5 }}>
                  <span>
                    {g.appName}
                    <span className="muted"> · {GUARD_LABEL[g.category]}</span>
                  </span>
                  <span className="muted">
                    {g.date} · {Math.max(1, Math.round(g.seconds / 60))} 分钟
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
