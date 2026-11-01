import { useState } from 'react'
import { useStore } from '../state/store'
import { Field } from './Sheet'
import type { FocusSession } from '../core/types'

/**
 * 一段专注刚结束时的「趁热记一笔」。
 * 只要求写一句话，目的是降低记录门槛，而不是逼你写论文。
 */
export function FocusNoteSheet({ session }: { session: FocusSession }) {
  const { data, actions } = useStore()
  const [title, setTitle] = useState(session.subject?.trim() || '')
  const [content, setContent] = useState('')
  const [minutes, setMinutes] = useState(String(session.minutes))

  const subject = session.subject?.trim() || data.settings.defaultFocusSubject

  const save = () => {
    const min = Math.max(1, Math.min(600, Number(minutes) || session.minutes))
    actions.addStudyLog({
      title: title.trim() || `${subject} · ${min} 分钟`,
      subject,
      minutes: min,
      content: content.trim(),
      tags: [],
    })
    actions.dismissFocusPrompt()
  }

  return (
    <div className="gate-backdrop" role="dialog" aria-modal="true">
      <div className="gate" style={{ maxWidth: 460 }}>
        <div className="gate-head">
          <div className="gate-mark">记</div>
          <div>
            <div className="gate-title">这段时间学到了什么</div>
            <div className="card-sub">
              刚做完 {session.minutes} 分钟，趁还热乎写一句，之后复习会用上
            </div>
          </div>
        </div>

        <div className="stack" style={{ gap: 10, marginTop: 16 }}>
          <Field label="标题">
            <input
              className="input"
              value={title}
              placeholder={`${subject} · 今天的一点收获`}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="学了什么（可留空）">
            <textarea
              className="input textarea"
              rows={3}
              value={content}
              placeholder="一句话、一个公式、一个想明白的点都可以"
              onChange={(e) => setContent(e.target.value)}
            />
          </Field>
          <div className="row" style={{ gap: 10 }}>
            <Field label="科目">
              <span className="tag">{subject}</span>
            </Field>
            <Field label="时长（分钟）">
              <input
                className="input num"
                style={{ width: 88 }}
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, ''))}
              />
            </Field>
          </div>
        </div>

        <div className="stack" style={{ gap: 8, marginTop: 18 }}>
          <button className="btn btn-primary" onClick={save}>
            记下来
          </button>
          <button className="btn btn-ghost" onClick={() => actions.dismissFocusPrompt()}>
            这次先不记
          </button>
        </div>
      </div>
    </div>
  )
}
