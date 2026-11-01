import type { ReactNode } from 'react'
import { Icon } from './Icons'
import { Sheet } from './Sheet'
import { speakWord } from '../core/speech'
import type { WordDetail } from '../core/wordDetail'

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']
const circ = (n: number) => CIRCLED[n - 1] ?? `(${n})`

/** 词性/词义这一块，卡片背面和详情弹层共用 */
export function WordEntries({ detail, compact }: { detail: WordDetail; compact?: boolean }) {
  const groups = compact ? detail.entries.slice(0, 2) : detail.entries
  return (
    <div className={`wd${compact ? ' wd-compact' : ''}`}>
      {groups.map((e, i) => (
        <div className="wd-block" key={`${e.pos}-${i}`}>
          <div className="wd-line">
            <span className="wd-label">【词性】</span>
            <span className="wd-pos">
              {circ(i + 1)} {e.pos || '—'}
            </span>
          </div>
          {e.senses.map((s, j) => (
            <div className="wd-line" key={j}>
              <span className="wd-label">{j === 0 ? '【词义】' : ''}</span>
              <span className="wd-text">
                <span className="wd-num">{circ(j + 1)}</span>
                {s}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** 词条详情：词性 / 词义 / 同义 / 反义 / 例句 */
export function WordDetailSheet({
  open,
  word,
  phonetic,
  detail,
  loading,
  fallbackMeaning,
  fallbackExample,
  footer,
  onClose,
}: {
  open: boolean
  word: string
  phonetic?: string
  detail: WordDetail | null
  loading: boolean
  fallbackMeaning?: string
  fallbackExample?: string
  /** 弹层底部操作，比如标熟 / 不认识 */
  footer?: ReactNode
  onClose: () => void
}) {
  const ph = detail?.phonetic || phonetic || ''
  const syn = detail?.synonyms ?? []
  const ant = detail?.antonyms ?? []
  const sents = detail?.sentences ?? []

  return (
    <Sheet open={open} title="词条" onClose={onClose}>
      <div className="wd-head">
        <div style={{ minWidth: 0 }}>
          <div className="wd-word">{word}</div>
          {ph ? <div className="word-phonetic">{ph}</div> : null}
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="icon-btn" aria-label="朗读单词" onClick={() => speakWord(word)}>
            <Icon name="sound" size={18} />
          </button>
        </div>
      </div>

      {loading ? <div className="card-sub">正在查词典…</div> : null}

      {detail && detail.entries.length > 0 ? <WordEntries detail={detail} /> : null}

      {!loading && !detail ? (
        <div className="wd">
          <div className="wd-block">
            <div className="wd-line">
              <span className="wd-label">【词义】</span>
              <span className="wd-text">{fallbackMeaning || '没查到这个词的中文释义'}</span>
            </div>
            {fallbackExample ? (
              <div className="wd-line">
                <span className="wd-label">【例句】</span>
                <span className="wd-text">{fallbackExample}</span>
              </div>
            ) : null}
          </div>
          <div className="card-sub">换个网络再试，或确认服务器地址已填好</div>
        </div>
      ) : null}

      {syn.length > 0 ? (
        <div className="wd-block">
          {syn.map((s, i) => (
            <div className="wd-line" key={`syn-${i}`}>
              <span className="wd-label">{i === 0 ? '【同义】' : ''}</span>
              <div style={{ minWidth: 0 }}>
                <div className="wd-text">
                  <span className="wd-num">{circ(i + 1)}</span>
                  {s.words.join(', ')}
                  {s.pos ? <span className="wd-sent-zh">　{s.pos}</span> : null}
                </div>
                {s.tran ? <div className="wd-sent-zh">{s.tran}</div> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {ant.length > 0 ? (
        <div className="wd-block">
          {ant.map((s, i) => (
            <div className="wd-line" key={`ant-${i}`}>
              <span className="wd-label">{i === 0 ? '【反义】' : ''}</span>
              <span className="wd-text">
                <span className="wd-num">{circ(i + 1)}</span>
                {s.words.join(', ')}
                {s.pos ? <span className="wd-sent-zh">　{s.pos}</span> : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {sents.length > 0 ? (
        <div className="wd-block">
          {sents.map((s, i) => (
            <div className="wd-line" key={`sen-${i}`}>
              <span className="wd-label">{i === 0 ? '【例句】' : ''}</span>
              <div style={{ minWidth: 0 }}>
                <div className="wd-sent">{s.en}</div>
                {s.zh ? <div className="wd-sent-zh">{s.zh}</div> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {footer ? <div style={{ marginTop: 16 }}>{footer}</div> : null}
    </Sheet>
  )
}
