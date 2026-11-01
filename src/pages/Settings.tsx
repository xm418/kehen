import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { useTodayKey } from '../hooks/useClock'
import { formatShort } from '../core/date'
import { Field } from '../components/Sheet'
import { AccountPanel } from '../components/AccountPanel'
import { GuardPanel } from '../components/GuardPanel'
import { AppCarePanel } from '../components/AppCarePanel'
import { exportToFile } from '../core/storage/localAdapter'
import { listSnapshots, readSnapshot, takeSnapshot } from '../core/backup'
import { PLAN_KEEP_DAYS } from '../core/store-model'
import type { AppData } from '../core/types'

function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 带 BOM，Excel 打开中文不乱码 */
function csvText(header: string[], rows: (string | number)[][]): string {
  return '\uFEFF' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

export function SettingsPage() {
  const { data, actions } = useStore()
  const today = useTodayKey()
  const snaps = useMemo(() => listSnapshots(), [data])
  const pomodoro = data.settings.pomodoro
  const focus = data.settings.focus
  const wordGoal = data.settings.words.dailyGoal

  const [importError, setImportError] = useState('')

  const exportJson = () => {
    exportToFile(JSON.stringify(data, null, 2), `刻痕备份-${today}.json`)
    actions.markBackedUp()
  }

  const exportStudies = () =>
    exportToFile(
      csvText(
        ['日期', '科目', '标题', '分钟', '标签', '内容'],
        [...data.studyLogs]
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((l) => [l.date, l.subject, l.title, l.minutes, l.tags.join(' '), l.content]),
      ),
      `刻痕-学习记录-${today}.csv`,
      'text/csv;charset=utf-8',
    )

  const exportHabits = () => {
    const names = new Map(data.habits.map((h) => [h.id, h.name]))
    exportToFile(
      csvText(
        ['日期', '习惯', '次数', '补录'],
        [...data.habitLogs]
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((l) => [l.date, names.get(l.habitId) ?? '已删除的习惯', l.count, l.backfill ? '是' : '']),
      ),
      `刻痕-打卡记录-${today}.csv`,
      'text/csv;charset=utf-8',
    )
  }

  const exportPlans = () =>
    exportToFile(
      csvText(
        ['日期', '内容', '完成', '临时', '来自目标'],
        [...data.plans]
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .flatMap((p) =>
            p.items.map((i) => [p.date, i.text, i.done ? '是' : '否', i.temp ? '是' : '', i.goalId ? '是' : '']),
          ),
      ),
      `刻痕-每日计划-${today}.csv`,
      'text/csv;charset=utf-8',
    )

  const exportBills = () =>
    exportToFile(
      csvText(
        ['日期', '类型', '分类', '金额', '备注'],
        [...data.expenses]
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((e) => [e.date, e.type === 'expense' ? '支出' : '收入', e.category, e.amount, e.note ?? '']),
      ),
      `刻痕-记账-${today}.csv`,
      'text/csv;charset=utf-8',
    )

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div className="eyebrow">设置</div>
        <h2 className="date-title" style={{ fontSize: 24, marginTop: 6 }}>
          调成适合自己的样子
        </h2>
        <div className="date-sub">改完立刻生效，手机上会自动保存</div>
      </div>

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">外观与称呼</h3>
            <div className="card-sub">首页会用这个称呼跟你打招呼</div>
          </div>
        </div>
        <div className="stack">
          <Field label="怎么称呼你">
            <input
              className="input"
              value={data.settings.nickname}
              placeholder="留空就只显示日期"
              maxLength={12}
              onChange={(e) => actions.updateSettings({ nickname: e.target.value })}
            />
          </Field>
          <Field label="主题">
            <div className="row" style={{ gap: 8 }}>
              {(
                [
                  { key: 'light', label: '浅色' },
                  { key: 'dark', label: '深色' },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  className={`pill${data.settings.theme === t.key ? ' active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => actions.updateSettings({ theme: t.key })}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">专注与番茄</h3>
            <div className="card-sub">时长按自己的注意力来，别硬撑</div>
          </div>
        </div>
        <div className="stack">
          <Field label="番茄时长（分钟）">
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input num"
                value={pomodoro.focus}
                onChange={(e) =>
                  actions.updateSettings({
                    pomodoro: {
                      ...pomodoro,
                      focus: Math.max(1, Number(e.target.value.replace(/[^\d]/g, '')) || 25),
                    },
                  })
                }
              />
              <input
                className="input num"
                value={pomodoro.shortBreak}
                onChange={(e) =>
                  actions.updateSettings({
                    pomodoro: {
                      ...pomodoro,
                      shortBreak: Math.max(1, Number(e.target.value.replace(/[^\d]/g, '')) || 5),
                    },
                  })
                }
              />
              <input
                className="input num"
                value={pomodoro.longBreak}
                onChange={(e) =>
                  actions.updateSettings({
                    pomodoro: {
                      ...pomodoro,
                      longBreak: Math.max(1, Number(e.target.value.replace(/[^\d]/g, '')) || 15),
                    },
                  })
                }
              />
            </div>
            <div className="card-sub">顺序为：专注 / 短休 / 长休</div>
          </Field>

          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <label className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
              <input
                type="checkbox"
                checked={pomodoro.autoStart}
                onChange={(e) =>
                  actions.updateSettings({ pomodoro: { ...pomodoro, autoStart: e.target.checked } })
                }
              />
              休息结束自动开始下一段
            </label>
            <label className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
              <input
                type="checkbox"
                checked={focus.lock}
                onChange={(e) => actions.updateSettings({ focus: { ...focus, lock: e.target.checked } })}
              />
              专注时锁住其他页面
            </label>
            <label className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
              <input
                type="checkbox"
                checked={focus.keepAwake}
                onChange={(e) => actions.updateSettings({ focus: { ...focus, keepAwake: e.target.checked } })}
              />
              保持屏幕常亮
            </label>
          </div>

          <Field label="默认专注主题">
            <input
              className="input"
              value={data.settings.defaultFocusSubject}
              onChange={(e) => actions.updateSettings({ defaultFocusSubject: e.target.value })}
            />
          </Field>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">单词学习</h3>
            <div className="card-sub">每天给自己定个量，单词页会按这个算今日进度</div>
          </div>
        </div>
        <div className="stack">
          <Field label="每天学习多少个单词">
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input num"
                style={{ maxWidth: 92 }}
                value={wordGoal}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^\d]/g, '')) || 30
                  actions.updateSettings({ words: { dailyGoal: Math.min(300, Math.max(1, n)) } })
                }}
              />
              {[20, 30, 50, 100].map((n) => (
                <button
                  key={n}
                  className={`pill${wordGoal === n ? ' active' : ''}`}
                  onClick={() => actions.updateSettings({ words: { dailyGoal: n } })}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="card-sub">按能长期坚持的量定，一下定太多反而容易断</div>
          </Field>
        </div>
      </section>

      <GuardPanel />

      <AppCarePanel />

      <div style={{ marginBottom: 12 }}>
        <AccountPanel />
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title">数据与备份</h3>
            <div className="card-sub">
              本机永远留一份 · 快照保留最近 7 天 · 计划保留最近 {PLAN_KEEP_DAYS} 天
            </div>
          </div>
        </div>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button className="btn btn-sm" onClick={exportJson}>
            导出全部（JSON）
          </button>
          <button className="btn btn-sm" onClick={exportStudies}>
            学习记录 CSV
          </button>
          <button className="btn btn-sm" onClick={exportHabits}>
            打卡记录 CSV
          </button>
          <button className="btn btn-sm" onClick={exportPlans}>
            每日计划 CSV
          </button>
          <button className="btn btn-sm" onClick={exportBills}>
            记账 CSV
          </button>
          <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
            导入 JSON
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const text = await file.text()
                  const parsed = JSON.parse(text) as Partial<AppData> | null
                  if (!parsed || typeof parsed !== 'object' || typeof parsed.version !== 'number' || !parsed.settings) {
                    setImportError('这个文件不是刻痕备份（缺少 version 或 settings）')
                    return
                  }
                  if (!confirm('导入会覆盖当前数据（会先把当前数据存一份快照），继续？')) return
                  actions.replaceData(parsed as AppData)
                  setImportError('')
                } catch {
                  setImportError('这个文件不是有效的刻痕备份')
                }
              }}
            />
          </label>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => {
              if (confirm('清空所有数据？这个操作不可撤销，建议先导出备份。')) actions.resetData()
            }}
          >
            清空数据
          </button>
        </div>
        {importError ? (
          <div className="card-sub" style={{ marginTop: 8, color: 'var(--ink)' }}>
            {importError}
          </div>
        ) : null}

        <hr className="divider" />

        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="eyebrow" style={{ flex: 1 }}>
            备份提醒
          </div>
          <label className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
            <input
              type="checkbox"
              checked={data.settings.backup.enabled}
              onChange={(e) =>
                actions.updateSettings({
                  backup: { ...data.settings.backup, enabled: e.target.checked },
                })
              }
            />
            超过 7 天没导出就提醒
          </label>
        </div>
        <div className="card-sub" style={{ marginTop: 6 }}>
          {data.settings.backup.lastExportedAt
            ? `上次导出：${formatShort(data.settings.backup.lastExportedAt.slice(0, 10))}`
            : '还没导出过备份'}
          {' · '}
          数据只在这台设备上，卸载或清数据就找不回来，隔段时间导出一次。
        </div>

        <hr className="divider" />

        <div className="row-between" style={{ alignItems: 'center' }}>
          <div className="eyebrow">自动快照（最近 7 天）</div>
          <button className="btn btn-ghost btn-sm" onClick={() => takeSnapshot(data, true)}>
            立即存一份
          </button>
        </div>
        {snaps.length === 0 ? (
          <div className="card-sub" style={{ marginTop: 6 }}>
            每天会自动存一份，最多保留 7 天。
          </div>
        ) : (
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            {snaps.map((s) => (
              <div className="row-between" key={s.date} style={{ fontSize: 12.5 }}>
                <span className="muted">
                  {formatShort(s.date)} · {s.habits} 个习惯 · {s.studyLogs} 条记录
                </span>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    const snap = readSnapshot(s.date)
                    if (!snap) {
                      alert('这份快照读不出来了')
                      return
                    }
                    if (!confirm(`用 ${s.date} 的快照覆盖当前数据？`)) return
                    takeSnapshot(data, true)
                    actions.replaceData(snap)
                  }}
                >
                  恢复
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="card-sub" style={{ marginTop: 6 }}>
          恢复前会先把当前数据另存一份。
        </div>
      </section>
    </>
  )
}
