import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useTodayKey } from '../hooks/useClock'
import { isPastDeadline, notifyOnce, todaysOpenHabits, unexcusedHabits } from '../core/supervision'
import { PandaSVG } from './PandaSVG'
import { Icon } from './Icons'

/** 把本地文件读成 base64（data URL） */
async function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 强制拦截层：过了截止时间还有习惯没做完 → 全屏盖住。
 * 解除条件三选一：
 *   1. 现在做完了 → 立刻关掉
 *   2. 提交证明（过程 + 一句话结论 + 可选图片）→ 解锁
 *   3. 都不做 → 拦截层持续，App 内走不动
 */
export function SupervisionGate() {
  const { data, ready, actions } = useStore()
  const today = useTodayKey()
  const [now, setNow] = useState(() => new Date())
  const [reasonFor, setReasonFor] = useState<string | null>(null)
  const [process, setProcess] = useState('')
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // 每分钟重新判断一次是否已经过点
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const cfg = data.settings.supervision
  const openHabits = todaysOpenHabits(data, today)
  const pending = unexcusedHabits(data, today)
  const visible = ready && cfg.intercept && isPastDeadline(cfg.deadlineHour, now) && pending.length > 0

  // 到点提醒一次（应用在前台时也能看到）
  useEffect(() => {
    if (!ready || !cfg.notify || !isPastDeadline(cfg.deadlineHour, now)) return
    if (openHabits.length === 0) return
    notifyOnce(today, '今天还有没做完的事', `${openHabits.map((h) => h.name).join('、')} 还空着`)
  }, [ready, cfg.notify, cfg.deadlineHour, now, openHabits.length, today])

  if (!visible) return null

  const pickImage = async (file: File) => {
    try {
      const b64 = await readAsBase64(file)
      setEvidence(b64)
    } catch {
      setEvidence(null)
    }
  }

  const openSubmit = (habitId: string) => {
    setReasonFor(habitId === reasonFor ? null : habitId)
    setProcess('')
    setReason('')
    setEvidence(null)
  }

  const submit = () => {
    if (!reasonFor || reason.trim().length < 2) return
    actions.recordIntercept(reasonFor, {
      reason: reason.trim(),
      process: process.trim() || undefined,
      evidence: evidence || undefined,
    })
    setReasonFor(null)
    setReason('')
    setProcess('')
    setEvidence(null)
  }

  const submitDisabled = reason.trim().length < 2

  return (
    <div className="gate-backdrop" role="dialog" aria-modal="true">
      <div className="gate">
        <div className="gate-pet">
          <PandaSVG mood="mad" size={96} className="gate-pet-svg" />
          <div className="gate-pet-line">到点了。不做完 / 不提交证明，别想往下走。</div>
        </div>

        <div className="gate-head">
          <div className="gate-mark">
            <Icon name="focus" size={18} />
          </div>
          <div>
            <div className="eyebrow">今天的截止时间已过</div>
            <h2 className="gate-title">还有 {pending.length} 件事没做</h2>
            <div className="card-sub">
              截止时间 {cfg.deadlineHour}:00 · 做完或提交证明才能关掉
            </div>
          </div>
        </div>

        <div className="gate-list">
          {pending.map((h) => (
            <div className="gate-item" key={h.id}>
              <div className="gate-item-head">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="habit-name">{h.name}</div>
                  <div className="habit-meta">
                    {h.schedule.type === 'daily'
                      ? '每天'
                      : h.schedule.type === 'weekdays'
                        ? '指定星期'
                        : `每周 ${h.schedule.times} 次`}
                  </div>
                </div>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => actions.toggleHabit(h.id, today)}
                >
                  现在做完了
                </button>
                <button className="btn btn-sm" onClick={() => openSubmit(h.id)}>
                  {reasonFor === h.id ? '收起' : '提交证明'}
                </button>
              </div>

              {reasonFor === h.id ? (
                <div className="gate-reason">
                  <label className="field-label">过程描述（选填）</label>
                  <textarea
                    className="textarea"
                    rows={2}
                    value={process}
                    placeholder="今天做了哪些事、花了多久、卡在哪……别写废话。"
                    maxLength={300}
                    onChange={(e) => setProcess(e.target.value)}
                  />

                  <label className="field-label">一句话结论（必填）</label>
                  <input
                    className="input"
                    value={reason}
                    autoFocus
                    maxLength={120}
                    placeholder="例如：今天没做，身体不舒服。"
                    onChange={(e) => setReason(e.target.value)}
                  />

                  <label className="field-label">证据图片（选填）</label>
                  {evidence ? (
                    <div className="gate-evidence-preview">
                      <img src={evidence} alt="证据" />
                      <button className="btn btn-sm btn-ghost" onClick={() => setEvidence(null)}>
                        移除
                      </button>
                    </div>
                  ) : (
                    <div className="gate-evidence-empty">
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) void pickImage(f)
                          e.target.value = ''
                        }}
                      />
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => fileRef.current?.click()}
                      >
                        拍照 / 选图（选填）
                      </button>
                      <span className="muted">· 截图、打卡界面、现场照片都行</span>
                    </div>
                  )}

                  <div className="gate-submit-row">
                    <button className="btn btn-sm" onClick={() => setReasonFor(null)}>
                      取消
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={submit}
                      disabled={submitDisabled}
                    >
                      {submitDisabled ? '先写一句话' : '提交并解锁'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="gate-foot">
          拦截会持续到你对每一件未完成的事给出交代。刻刻替明天的你盯着。
        </div>
      </div>
    </div>
  )
}
