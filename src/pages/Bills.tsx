import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useTodayKey } from '../hooks/useClock'
import { formatShort, weekdayLabel } from '../core/date'
import { Sheet, Field } from '../components/Sheet'
import type { Expense, ExpenseType } from '../core/types'

const EXPENSE_CATS = ['餐饮', '交通', '学习', '购物', '娱乐', '居住', '医疗', '其他']
const INCOME_CATS = ['工资', '兼职', '红包', '理财', '其他']

function money(n: number): string {
  const fixed = Math.round(n * 100) / 100
  return fixed.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${y} 年 ${Number(m)} 月`
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function BillsPage() {
  const { data, actions } = useStore()
  const today = useTodayKey()
  const currentMonth = today.slice(0, 7)

  const [month, setMonth] = useState(currentMonth)
  const [type, setType] = useState<ExpenseType>('expense')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(EXPENSE_CATS[0])
  const [note, setNote] = useState('')
  const [date, setDate] = useState(today)
  const [detail, setDetail] = useState<Expense | null>(null)
  const [keyword, setKeyword] = useState('')

  // 每月初跨月时自动跟进，不然会一直停在旧月份；正在翻历史月份则不动
  const prevCurrent = useRef(currentMonth)
  useEffect(() => {
    setMonth((m) => (m >= prevCurrent.current || m > currentMonth ? currentMonth : m))
    prevCurrent.current = currentMonth
  }, [currentMonth])

  const cats = type === 'expense' ? EXPENSE_CATS : INCOME_CATS

  const switchType = (next: ExpenseType) => {
    setType(next)
    setCategory(next === 'expense' ? EXPENSE_CATS[0] : INCOME_CATS[0])
  }

  const monthly = useMemo(
    () =>
      data.expenses
        .filter((e) => e.date.startsWith(month))
        .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1)),
    [data.expenses, month],
  )

  const totalExpense = monthly.filter((e) => e.type === 'expense').reduce((a, e) => a + e.amount, 0)
  const totalIncome = monthly.filter((e) => e.type === 'income').reduce((a, e) => a + e.amount, 0)

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of monthly) {
      if (e.type !== 'expense') continue
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [monthly])

  // 搜索只过滤下面的流水，不影响本月合计
  const shown = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return monthly
    return monthly.filter(
      (e) => (e.note ?? '').toLowerCase().includes(q) || e.category.toLowerCase().includes(q),
    )
  }, [monthly, keyword])

  const grouped = useMemo(() => {
    const map = new Map<string, Expense[]>()
    for (const e of shown) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return [...map.entries()]
  }, [shown])

  const canSubmit = Number(amount) > 0

  const submit = () => {
    if (!canSubmit) return
    actions.addExpense({ amount: Number(amount), type, category, note, date })
    setAmount('')
    setNote('')
  }

  const percent = (v: number) => (totalExpense > 0 ? Math.round((v / totalExpense) * 100) : 0)

  return (
    <>
      <div className="row-between" style={{ marginBottom: 16 }}>
        <div>
          <div className="eyebrow">记账</div>
          <h2 className="date-title" style={{ fontSize: 24, marginTop: 6 }}>
            钱花在哪了
          </h2>
          <div className="date-sub">
            本月 {monthly.length} 笔 · 支出 ¥{money(totalExpense)}
          </div>
        </div>
      </div>

      <div className="row-between" style={{ marginBottom: 12 }}>
        <button className="btn btn-sm" onClick={() => setMonth(shiftMonth(month, -1))}>
          ‹ 上个月
        </button>
        <div className="eyebrow">{monthLabel(month)}</div>
        <button
          className="btn btn-sm"
          disabled={month >= currentMonth}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          下个月 ›
        </button>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <input
          className="input"
          placeholder="搜索备注或分类"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      <div className="metric-row" style={{ marginBottom: 12 }}>
        <div className="metric">
          <div className="metric-value" style={{ color: 'var(--danger)' }}>
            {totalExpense ? `¥${money(totalExpense)}` : '¥0'}
          </div>
          <div className="metric-label">本月支出</div>
        </div>
        <div className="metric">
          <div className="metric-value">{totalIncome ? `¥${money(totalIncome)}` : '¥0'}</div>
          <div className="metric-label">本月收入</div>
        </div>
        <div className="metric">
          <div className="metric-value" style={{ color: totalIncome - totalExpense < 0 ? 'var(--danger)' : undefined }}>
            ¥{money(totalIncome - totalExpense)}
          </div>
          <div className="metric-label">本月结余</div>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <div>
            <h3 className="card-title">记一笔</h3>
            <div className="card-sub">先记下来，月底再看要不要改习惯</div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className={`pill${type === 'expense' ? ' active' : ''}`} onClick={() => switchType('expense')}>
              支出
            </button>
            <button className={`pill${type === 'income' ? ' active' : ''}`} onClick={() => switchType('income')}>
              收入
            </button>
          </div>
        </div>

        <div className="stack">
          <div className="row" style={{ gap: 8 }}>
            <span style={{ fontSize: 22, color: 'var(--muted)' }}>¥</span>
            <input
              className="input num"
              style={{ fontSize: 20 }}
              value={amount}
              inputMode="decimal"
              placeholder="0.00"
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
            />
          </div>

          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {cats.map((c) => (
              <button
                key={c}
                className={`pill${category === c ? ' active' : ''}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>

          <input
            className="input"
            value={note}
            placeholder="备注（可留空）"
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="row" style={{ gap: 8 }}>
            <input
              className="input"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value || today)}
              style={{ flex: '0 0 auto', width: 150 }}
            />
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={!canSubmit} onClick={submit}>
              记下
            </button>
          </div>
        </div>
      </section>

      {byCategory.length > 0 ? (
        <section className="card" style={{ marginBottom: 12 }}>
          <div className="card-head">
            <div>
              <h3 className="card-title">分类占比</h3>
              <div className="card-sub">这个月支出都去了哪</div>
            </div>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            {byCategory.map(([cat, val]) => (
              <div key={cat}>
                <div className="row-between" style={{ fontSize: 12.5, marginBottom: 4 }}>
                  <span>{cat}</span>
                  <span className="num muted">
                    ¥{money(val)} · {percent(val)}%
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 999,
                    background: 'var(--surface-2)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ height: '100%', width: `${percent(val)}%`, background: 'var(--ink)' }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {grouped.length === 0 ? (
        <div className="card">
          <div className="empty">
            {keyword.trim() ? '没有匹配的流水，换个关键词试试。' : '这个月还没有记录。买第一杯咖啡时，顺手记一笔。'}
          </div>
        </div>
      ) : (
        grouped.map(([day, items]) => {
          const dayNet = items.reduce((a, e) => a + (e.type === 'income' ? e.amount : -e.amount), 0)
          return (
            <div key={day}>
              <div className="day-label">
                <span className="eyebrow">
                  {formatShort(day)} 周{weekdayLabel(day)}
                </span>
                <span className="line" />
                <span className="num muted" style={{ fontSize: 11 }}>
                  {dayNet >= 0 ? '+' : '-'}¥{money(Math.abs(dayNet))}
                </span>
              </div>
              <div className="day-group">
                {items.map((e) => (
                  <article
                    className="log-card"
                    key={e.id}
                    onClick={() => setDetail(e)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="row-between">
                      <span className="log-title">{e.note || e.category}</span>
                      <span
                        className="num"
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: e.type === 'expense' ? 'var(--danger)' : undefined,
                        }}
                      >
                        {e.type === 'expense' ? '-' : '+'}¥{money(e.amount)}
                      </span>
                    </div>
                    <div className="log-meta">
                      <span className="tag">{e.category}</span>
                      <span>{e.type === 'expense' ? '支出' : '收入'}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )
        })
      )}

      <ExpenseDetail expense={detail} onClose={() => setDetail(null)} />
    </>
  )
}

/** 点开一笔账：可以改金额、分类、备注、日期，也可以删掉 */
function ExpenseDetail({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const { actions } = useStore()
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    if (!expense) return
    setAmount(String(expense.amount))
    setCategory(expense.category)
    setNote(expense.note ?? '')
    setDate(expense.date)
  }, [expense])

  if (!expense) return null

  const cats = expense.type === 'expense' ? EXPENSE_CATS : INCOME_CATS
  const nextCategory = cats.includes(category) ? category : cats[0]

  const save = () => {
    const value = Number(amount)
    if (!value) return
    actions.updateExpense(expense.id, {
      amount: value,
      category: nextCategory,
      note: note.trim() || undefined,
      date: date || expense.date,
    })
    onClose()
  }

  return (
    <Sheet
      open={!!expense}
      onClose={onClose}
      title={expense.type === 'expense' ? '修改这笔支出' : '修改这笔收入'}
      subtitle={`${formatShort(expense.date)} 周${weekdayLabel(expense.date)}`}
    >
      <div className="stack">
        <Field label="金额">
          <input
            className="input num"
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
          />
        </Field>

        <Field label="分类">
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {cats.map((c) => (
              <button
                key={c}
                className={`pill${nextCategory === c ? ' active' : ''}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>

        <Field label="备注">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="可留空" />
        </Field>

        <Field label="日期">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={!Number(amount)}>
            保存
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm('删除这笔记录？')) {
                actions.removeExpense(expense.id)
                onClose()
              }
            }}
          >
            删除
          </button>
        </div>
      </div>
    </Sheet>
  )
}
