import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { Field } from './Sheet'
import { buildReminderIcs } from '../core/ics'
import { exportToFile } from '../core/storage/localAdapter'
import { isNativeApp } from '../core/nativeNotify'

interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** PWA 安装入口：支持 beforeinstallprompt 的浏览器给按钮，其余给操作说明 */
function useInstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvent(e as InstallEvent)
    }
    const onInstalled = () => {
      setEvent(null)
      setInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  return { event, installed }
}

export function AccountPanel() {
  const { data, actions, sync } = useStore()
  const cfg = data.settings.supervision
  const account = data.settings.account
  const install = useInstallPrompt()

  const [email, setEmail] = useState(account?.email ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [endpoint, setEndpoint] = useState(data.settings.sync.endpoint ?? '')
  // 安装包里没有同源的 /api，相对地址连不上，需要填完整地址
  const endpointMissing = isNativeApp() && !endpoint.trim()

  const run = async (kind: 'login' | 'register') => {
    if (endpointMissing) {
      setError('安装包里没有同源的 /api，先在上面填完整地址，例如 http://182.244.118.248:8787/api')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (kind === 'login') await actions.login(email, password)
      else await actions.register(email, password)
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const syncNow = async () => {
    if (endpointMissing) {
      setError('安装包里没有同源的 /api，先在上面填完整地址，例如 http://182.244.118.248:8787/api')
      return
    }
    setBusy(true)
    setError('')
    try {
      await actions.syncNow()
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失败')
    } finally {
      setBusy(false)
    }
  }

  const statusText =
    sync.state === 'syncing'
      ? '同步中…'
      : sync.message
        ? sync.message
        : account
          ? '已登录，等待同步'
          : '未登录，数据只在本机'

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">监督机制</h3>
            <div className="card-sub">关掉任何一条，都会给偷懒留口子</div>
          </div>
        </div>

        <div className="stack">
          <Field label={`每日截止时间：${cfg.deadlineHour}:00`}>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {[18, 20, 21, 22, 23].map((h) => (
                <button
                  key={h}
                  className={`pill${cfg.deadlineHour === h ? ' active' : ''}`}
                  onClick={() =>
                    actions.updateSettings({ supervision: { ...cfg, deadlineHour: h } })
                  }
                >
                  {h}:00
                </button>
              ))}
            </div>
            <div className="card-sub">过了这个点还没做完，会被强制拦下来写原因。</div>
          </Field>

          <Field label="开关">
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {(
                [
                  { key: 'intercept', label: '强制拦截' },
                  { key: 'notify', label: '系统通知' },
                  { key: 'debt', label: '累计欠账' },
                  { key: 'lock', label: '断签锁定' },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  className={`pill${cfg[item.key] ? ' active' : ''}`}
                  onClick={() =>
                    actions.updateSettings({
                      supervision: { ...cfg, [item.key]: !cfg[item.key] },
                    })
                  }
                >
                  {item.label} · {cfg[item.key] ? '开' : '关'}
                </button>
              ))}
            </div>
          </Field>

          {cfg.notify ? (
            <div className="row-between">
              <div className="card-sub" style={{ margin: 0 }}>
                {typeof Notification === 'undefined'
                  ? '当前浏览器不支持系统通知'
                  : Notification.permission === 'granted'
                    ? '已允许通知，到点会提醒一次'
                    : '还没有通知权限，到点只能靠应用内拦截'}
              </div>
              {typeof Notification !== 'undefined' && Notification.permission === 'default' ? (
                <button className="btn btn-sm" onClick={() => Notification.requestPermission()}>
                  允许通知
                </button>
              ) : null}
            </div>
          ) : null}

          <Field label="断签阈值（连续几天没做就锁住新增）">
            <div className="row" style={{ gap: 6 }}>
              {[2, 3, 5, 7].map((n) => (
                <button
                  key={n}
                  className={`pill${cfg.lockAfterMiss === n ? ' active' : ''}`}
                  onClick={() =>
                    actions.updateSettings({ supervision: { ...cfg, lockAfterMiss: n } })
                  }
                >
                  {n} 天
                </button>
              ))}
            </div>
          </Field>

          {data.intercepts.length > 0 ? (
            <>
              <hr className="divider" />
              <div>
                <div className="eyebrow">最近没做的原因</div>
                <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                  {data.intercepts.slice(-3).reverse().map((r) => (
                    <div key={r.id} className="row-between" style={{ fontSize: 12.5 }}>
                      <span className="muted">
                        {r.date} · {r.habitName}
                      </span>
                      <span style={{ maxWidth: '55%', textAlign: 'right' }}>{r.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">不打开也能被提醒</h3>
            <div className="card-sub">每天 {cfg.deadlineHour}:00，交给手机系统日历</div>
          </div>
        </div>
        <div className="stack">
          <div className="card-sub" style={{ lineHeight: 1.8 }}>
            应用内的通知只有页面开着才会响。把这条提醒写进系统日历，就算一整天没打开刻痕，手机也会准时提醒你。
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-sm btn-primary"
              onClick={() =>
                exportToFile(
                  buildReminderIcs(
                    cfg.deadlineHour,
                    data.habits.filter((h) => !h.archived).map((h) => h.name),
                  ),
                  '刻痕提醒.ics',
                  'text/calendar',
                )
              }
            >
              下载日历提醒
            </button>
            <span className="card-sub" style={{ margin: 0 }}>
              每天重复 · 改截止时间后重新导入一次
            </span>
          </div>
          <div className="card-sub">
            iPhone：用「日历」打开下载的文件；安卓：用系统日历打开。导入后建议把事件设成全天可见。
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">账号与云端同步</h3>
            <div className="card-sub">{statusText}</div>
          </div>
          {account ? <span className="tag">{account.email}</span> : null}
        </div>

        <div className="stack">
          <Field label="服务器地址（留空 = 同源 /api）">
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input"
                value={endpoint}
                placeholder="http://192.168.1.10:8787/api"
                onChange={(e) => setEndpoint(e.target.value)}
                onBlur={() => actions.updateSettings({ sync: { ...data.settings.sync, endpoint } })}
              />
            </div>
          </Field>

          {endpointMissing ? (
            <div className="card-sub" style={{ color: 'var(--ink)', lineHeight: 1.8 }}>
              安装包里没有同源的 /api，必须填完整地址（电脑和手机要在同一个能连通的网络里），例如
              http://182.244.118.248:8787/api
            </div>
          ) : null}

          {!account ? (
            <>
              <div className="grid-2" style={{ gap: 8 }}>
                <Field label="邮箱">
                  <input
                    className="input"
                    value={email}
                    inputMode="email"
                    autoComplete="email"
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </Field>
                <Field label="密码（至少 6 位）">
                  <input
                    className="input"
                    type="password"
                    value={password}
                    autoComplete="current-password"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={busy || endpointMissing || !email.trim() || password.length < 6}
                  onClick={() => run('login')}
                >
                  登录
                </button>
                <button
                  className="btn btn-sm"
                  disabled={busy || endpointMissing || !email.trim() || password.length < 6}
                  onClick={() => run('register')}
                >
                  注册新账号
                </button>
              </div>
              <div className="card-sub">
                第一次登录时，如果云端已有数据会以云端为准；云端为空则把本机数据传上去。
              </div>
            </>
          ) : (
            <>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-sm btn-primary" disabled={busy || endpointMissing} onClick={syncNow}>
                  立即同步
                </button>
                <label className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
                  <input
                    type="checkbox"
                    checked={data.settings.sync.autoSync}
                    onChange={(e) =>
                      actions.updateSettings({
                        sync: { ...data.settings.sync, autoSync: e.target.checked },
                      })
                    }
                  />
                  改动自动上传
                </label>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => {
                    if (confirm('退出登录？本机数据会保留。')) actions.logout()
                  }}
                >
                  退出登录
                </button>
              </div>
              <div className="card-sub">
                {sync.at ? `最后同步：${new Date(sync.at).toLocaleString()}` : '还没有同步过'}
              </div>
            </>
          )}

          {error ? <div className="warn-line" style={{ color: 'var(--danger)' }}>{error}</div> : null}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">装到手机上</h3>
            <div className="card-sub">
              {install.installed
                ? '已经以独立应用的方式运行'
                : '添加后可以全屏打开、离线可用，和 App 一样'}
            </div>
          </div>
          {install.event ? (
            <button
              className="btn btn-sm"
              onClick={async () => {
                await install.event?.prompt()
                await install.event?.userChoice
              }}
            >
              立即安装
            </button>
          ) : null}
        </div>
        {!install.installed && !install.event ? (
          <div className="card-sub" style={{ lineHeight: 1.8 }}>
            电脑：Chrome / Edge 地址栏右侧的安装图标。
            <br />
            iPhone：Safari 分享菜单 → 添加到主屏幕。
            <br />
            安卓：浏览器菜单 → 添加到主屏幕；需要先通过服务器地址访问，别用 file:// 打开。
          </div>
        ) : null}
      </section>
    </div>
  )
}
