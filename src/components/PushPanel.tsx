import { useEffect, useState, type CSSProperties } from 'react'
import { useStore } from '../state/store'
import { disablePush, enablePush, getPushState, pushSupported, type PushState } from '../core/push'

/**
 * 后台提醒开关（不会自动挂载，由设置页决定放在哪里）。
 * 依赖 store 里的云同步账号：没登录 / 没开云同步时按钮直接禁用。
 */
export function PushPanel() {
  const { data } = useStore()
  const token = data.settings.account?.token
  const endpoint = data.settings.sync.endpoint
  const cloudOn = data.settings.sync.mode === 'cloud'
  const supported = pushSupported()

  const [state, setState] = useState<PushState>({ subscribed: false, count: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tip, setTip] = useState('')

  useEffect(() => {
    if (!supported || !cloudOn || !token) return
    let alive = true
    getPushState(endpoint, token)
      .then((next) => {
        if (alive) setState(next)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : '读取推送状态失败')
      })
    return () => {
      alive = false
    }
  }, [supported, cloudOn, token, endpoint])

  const canUse = supported && cloudOn && !!token
  const subscribed = canUse && state.subscribed

  const enable = async () => {
    if (!token) return
    setBusy(true)
    setError('')
    setTip('')
    try {
      await enablePush(endpoint, token)
      setState(await getPushState(endpoint, token))
      setTip('已开启，这个设备关掉页面也能收到提醒。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '开启失败')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    if (!token) return
    setBusy(true)
    setError('')
    setTip('')
    try {
      await disablePush(endpoint, token)
      setState(await getPushState(endpoint, token))
      setTip('已关闭后台提醒。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '关闭失败')
    } finally {
      setBusy(false)
    }
  }

  const hint = !supported
    ? '当前环境不支持后台推送：需要用 HTTPS 或 localhost 打开，并在浏览器里运行。'
    : !token
      ? '需要先登录云同步账号，才可能开启。'
      : !cloudOn
        ? '云同步没有开启，服务端拿不到你的数据，无法判断要不要提醒。'
        : '需要登录云同步账号，且浏览器允许通知；关掉页面也能收到。'

  const statusText = !supported
    ? '不支持'
    : !canUse
      ? '不可用'
      : subscribed
        ? `已开启 · ${state.count} 台设备`
        : '未开启'

  const buttonStyle: CSSProperties = {
    padding: '8px 16px',
    borderRadius: 999,
    border: subscribed ? '1px solid var(--border-strong)' : 'none',
    background: subscribed ? 'var(--surface)' : 'var(--ink)',
    color: subscribed ? 'var(--text)' : 'var(--on-ink)',
    fontSize: 13,
    fontWeight: 500,
    cursor: busy || !canUse ? 'default' : 'pointer',
    opacity: busy || !canUse ? 0.45 : 1,
  }

  return (
    <section className="card">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
            后台提醒
          </h3>
          <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.7, color: 'var(--muted)' }}>
            {hint}
          </div>
        </div>
        <span style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--muted)' }}>
          {statusText}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        {subscribed ? (
          <button style={buttonStyle} disabled={busy || !canUse} onClick={disable}>
            {busy ? '处理中…' : '关闭后台提醒'}
          </button>
        ) : (
          <button style={buttonStyle} disabled={busy || !canUse} onClick={enable}>
            {busy ? '处理中…' : '开启后台提醒'}
          </button>
        )}
      </div>

      {error ? (
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--danger)' }}>{error}</div>
      ) : null}
      {tip ? <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--muted)' }}>{tip}</div> : null}
    </section>
  )
}
