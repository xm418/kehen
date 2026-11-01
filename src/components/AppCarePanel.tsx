import { useState } from 'react'
import { useStore } from '../state/store'
import { Field } from './Sheet'
import { APP_VERSION, compareVersion, fetchLatest, installUpdate, type UpdateInfo } from '../core/update'
import { submitFeedback } from '../core/feedback'

export function AppCarePanel() {
  const { data } = useStore()
  const endpoint = data.settings.sync.endpoint

  const [latest, setLatest] = useState<UpdateInfo | null>(null)
  const [checkMsg, setCheckMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const [text, setText] = useState('')
  const [contact, setContact] = useState('')
  const [fbMsg, setFbMsg] = useState('')
  const [sending, setSending] = useState(false)

  const check = async () => {
    setBusy(true)
    setCheckMsg('')
    try {
      const info = await fetchLatest(endpoint)
      setLatest(info)
      setCheckMsg(
        compareVersion(info.version, APP_VERSION) > 0
          ? `有新版 ${info.version}，更新后再继续用`
          : `已是最新（${APP_VERSION}）`,
      )
    } catch (err) {
      setLatest(null)
      setCheckMsg(err instanceof Error ? err.message : '检查失败')
    } finally {
      setBusy(false)
    }
  }

  const doInstall = async () => {
    if (!latest) return
    setBusy(true)
    try {
      setCheckMsg(await installUpdate(latest, endpoint))
    } catch (err) {
      setCheckMsg(err instanceof Error ? err.message : '下载失败')
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    setSending(true)
    setFbMsg('')
    try {
      await submitFeedback(endpoint, { text, contact })
      setText('')
      setFbMsg('已收到，谢谢你。会按条看完，能做的就排进下个版本。')
    } catch (err) {
      setFbMsg(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSending(false)
    }
  }

  const hasUpdate = latest ? compareVersion(latest.version, APP_VERSION) > 0 : false

  return (
    <section className="card" style={{ marginBottom: 12 }}>
      <div className="card-head">
        <div>
          <h3 className="card-title">更新与提议</h3>
          <div className="card-sub">当前版本 {APP_VERSION} · 有新版本可直接在这里下载安装</div>
        </div>
      </div>

      <div className="stack">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" disabled={busy} onClick={check}>
            {busy ? '处理中…' : '检查更新'}
          </button>
          {hasUpdate ? (
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={doInstall}>
              下载并安装 {latest?.version}
            </button>
          ) : null}
        </div>
        {checkMsg ? <div className="card-sub">{checkMsg}</div> : null}
        {hasUpdate && latest?.notes ? (
          <div className="card-sub" style={{ lineHeight: 1.8, whiteSpace: 'pre-line' }}>
            {latest.notes}
          </div>
        ) : null}

        <hr className="divider" />

        <div className="eyebrow">用户提议</div>
        <div className="card-sub">想要什么功能、哪里用着别扭，写下来就行，不用客气。</div>
        <Field label="你的提议">
          <textarea
            className="input"
            rows={3}
            value={text}
            maxLength={1000}
            placeholder="比如：希望增加 xxx；专注计时结束能不能响一声…"
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <Field label="怎么联系你（可不填）">
          <input
            className="input"
            value={contact}
            maxLength={60}
            placeholder="邮箱 / 微信 / 手机号都行"
            onChange={(e) => setContact(e.target.value)}
          />
        </Field>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-sm btn-primary" disabled={sending || !text.trim()} onClick={send}>
            {sending ? '提交中…' : '提交提议'}
          </button>
        </div>
        {fbMsg ? <div className="card-sub">{fbMsg}</div> : null}

        <hr className="divider" />

        <div className="eyebrow">云端到底在哪</div>
        <div className="card-sub" style={{ lineHeight: 1.8 }}>
          云端就是你自己的那台服务器：账号、同步数据写在 server/data.json，推送订阅在 push-store.json。
          电脑关机或者服务没开，同步就连不上，但数据一直留在本机，不会丢。
        </div>
      </div>
    </section>
  )
}
