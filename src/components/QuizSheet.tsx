import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'
import { Icon } from './Icons'
import { speakWord } from '../core/speech'
import { useStore } from '../state/store'
import type { WordItem } from '../core/types'

type QuizMode = 'spell' | 'choice'

/** 一次测验多少个词 */
const ROUND_SIZE = 10

function shuffle<T>(list: T[]): T[] {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * 单词测验：拼写（看音标释义写单词）和看词选义。
 * 答对按复习计划往后排，答错自动进错词本。
 */
export function QuizSheet({
  open,
  words,
  onClose,
}: {
  open: boolean
  words: WordItem[]
  onClose: () => void
}) {
  const { actions } = useStore()
  const [mode, setMode] = useState<QuizMode>('spell')
  const [batch, setBatch] = useState<WordItem[]>([])
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  const [input, setInput] = useState('')
  const [judged, setJudged] = useState<null | boolean>(null)

  const start = (list: WordItem[]) => {
    setBatch(shuffle(list).slice(0, ROUND_SIZE))
    setIndex(0)
    setResults([])
    setInput('')
    setJudged(null)
  }

  useEffect(() => {
    if (open) start(words)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const hasMeanings = words.filter((w) => w.meaning).length >= 4
  const current = batch[index]
  const finished = batch.length > 0 && index >= batch.length

  // 选项定下来就不再重排，免得答完题之后选项跳位置
  const [options, setOptions] = useState<string[]>([])
  useEffect(() => {
    if (!current?.meaning) {
      setOptions([])
      return
    }
    const pool = [...new Set(words.filter((w) => w.meaning && w.meaning !== current.meaning).map((w) => w.meaning as string))]
    setOptions(shuffle([current.meaning, ...shuffle(pool).slice(0, 3)]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, mode])

  const record = (ok: boolean) => {
    if (!current || judged !== null) return
    setJudged(ok)
    setResults((prev) => [...prev, ok])
    actions.rateWord(current.id, ok)
  }

  const next = () => {
    setJudged(null)
    setInput('')
    setIndex((i) => i + 1)
  }

  const submitSpell = () => {
    if (!current || judged !== null) return
    const typed = input.trim().toLowerCase()
    if (!typed) return
    record(typed === current.word.toLowerCase())
  }

  const correctCount = results.filter(Boolean).length
  const acc = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0
  const wrongWords = batch.filter((_w, i) => results[i] === false)

  return (
    <Sheet
      open={open}
      title={finished ? '测验结果' : '单词测验'}
      subtitle={finished ? `${results.length} 个词 · 正确率 ${acc}%` : `第 ${Math.min(index + 1, batch.length)} / ${batch.length} 个`}
      onClose={onClose}
    >
      {batch.length === 0 ? <div className="empty">选中的范围里还没有可测验的单词</div> : null}

      {!finished && current ? (
        <div className="stack">
          <div className="row" style={{ gap: 6 }}>
            <button
              className={`pill${mode === 'spell' ? ' active' : ''}`}
              onClick={() => {
                setMode('spell')
                setJudged(null)
                setInput('')
              }}
            >
              拼写
            </button>
            <button
              className={`pill${mode === 'choice' && hasMeanings ? ' active' : ''}`}
              disabled={!hasMeanings}
              onClick={() => {
                if (!hasMeanings) return
                setMode('choice')
                setJudged(null)
                setInput('')
              }}
            >
              看词选义
            </button>
            {!hasMeanings ? <span className="muted" style={{ fontSize: 11.5 }}>释义太少，先补全释义再用选义</span> : null}
          </div>

          {mode === 'spell' || !current.meaning ? (
            <>
              <div className="card" style={{ textAlign: 'center', background: 'var(--surface-2)' }}>
                {current.phonetic ? <div className="word-phonetic">{current.phonetic}</div> : null}
                <div className="card-sub" style={{ marginTop: 6 }}>
                  {current.meaning || current.group || '听发音，拼出这个词'}
                </div>
                <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => speakWord(current.word)}>
                  <Icon name="sound" size={15} /> 播放发音
                </button>
              </div>
              <input
                className="input"
                autoFocus
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="拼出这个词，回车提交"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitSpell()
                }}
              />
              {judged === null ? (
                <button className="btn btn-primary btn-block" disabled={!input.trim()} onClick={submitSpell}>
                  提交
                </button>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {judged ? '对了。' : `不对，正确答案是 ${current.word}。`}
                    {current.meaning ? `　${current.meaning}` : ''}
                  </div>
                  <button className="btn btn-primary btn-block" onClick={next}>
                    {index + 1 >= batch.length ? '看结果' : '下一个'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="card" style={{ textAlign: 'center', background: 'var(--surface-2)' }}>
                <div className="word-text" style={{ fontSize: 28 }}>
                  {current.word}
                </div>
                <button className="icon-btn" style={{ margin: '6px auto 0' }} onClick={() => speakWord(current.word)} aria-label="朗读单词">
                  <Icon name="sound" size={18} />
                </button>
              </div>
              {options.map((opt) => (
                <button
                  key={opt}
                  className={`btn btn-block quiz-opt${judged !== null && opt === current.meaning ? ' btn-primary' : ''}`}
                  disabled={judged !== null}
                  onClick={() => record(opt === current.meaning)}
                >
                  {opt}
                </button>
              ))}
              {judged !== null ? (
                <div className="stack" style={{ gap: 8 }}>
                  <div className="muted" style={{ fontSize: 13 }}>{judged ? '选对了。' : '选错了，已收进错词本。'}</div>
                  <button className="btn btn-primary btn-block" onClick={next}>
                    {index + 1 >= batch.length ? '看结果' : '下一个'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {finished ? (
        <div className="stack">
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="num" style={{ fontSize: 30, fontWeight: 650 }}>
              {acc}%
            </div>
            <div className="card-sub">
              答对 {correctCount} / {results.length} 个
            </div>
          </div>
          {wrongWords.length > 0 ? (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                错词（已进错词本）
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {wrongWords.map((w) => (
                  <div key={w.id} className="row-between">
                    <span className="log-title" style={{ fontSize: 14 }}>{w.word}</span>
                    <span className="muted" style={{ fontSize: 12, textAlign: 'right', maxWidth: '60%' }}>
                      {w.meaning || w.phonetic || ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>
              全对，这些词已经往后排了复习。
            </div>
          )}
          <button className="btn btn-primary btn-block" onClick={() => start(words)}>
            再来一组
          </button>
        </div>
      ) : null}
    </Sheet>
  )
}
