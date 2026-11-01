import { useEffect, useState } from 'react'
import { Sheet, Field } from './Sheet'
import { useStore } from '../state/store'
import { todayKey } from '../core/date'

export function StudyForm({
  open,
  onClose,
  defaultSubject,
}: {
  open: boolean
  onClose: () => void
  defaultSubject?: string
}) {
  const { data, actions } = useStore()
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [minutes, setMinutes] = useState('30')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')

  useEffect(() => {
    if (open) {
      setTitle('')
      setSubject(defaultSubject ?? data.settings.defaultFocusSubject)
      setMinutes('30')
      setContent('')
      setTags('')
    }
  }, [open, defaultSubject, data.settings.defaultFocusSubject])

  const subjects = Array.from(new Set(data.studyLogs.map((l) => l.subject))).slice(0, 6)

  const submit = () => {
    if (!title.trim()) return
    actions.addStudyLog({
      title,
      subject,
      minutes: Number(minutes) || 0,
      content,
      tags: tags
        .split(/[,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean),
      date: todayKey(),
    })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="记录这次学习" subtitle="记下来，之后会自动安排复习">
      <div className="stack">
        <Field label="学了什么">
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：第三章 线性代数 特征值"
            autoFocus
          />
        </Field>

        <div className="grid-3">
          <Field label="科目分类">
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="专业学习" />
          </Field>
          <Field label="时长（分钟）">
            <input
              className="input num"
              value={minutes}
              inputMode="numeric"
              onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, ''))}
            />
          </Field>
        </div>

        {subjects.length > 0 ? (
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {subjects.map((s) => (
              <button key={s} className="pill" onClick={() => setSubject(s)} type="button">
                {s}
              </button>
            ))}
          </div>
        ) : null}

        <Field label="内容 / 心得">
          <textarea
            className="textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="关键结论、卡住的点、下次要补的地方"
          />
        </Field>

        <Field label="标签（用逗号分隔）">
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="如：重点、易错" />
        </Field>

        <button className="btn btn-primary btn-block" onClick={submit} disabled={!title.trim()}>
          保存
        </button>
      </div>
    </Sheet>
  )
}
