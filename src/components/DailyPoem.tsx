import { poemOfDay } from '../core/poetry'
import { useTodayKey } from '../hooks/useClock'

/** 每天一首，不换、不推、不打扰；只是开页面时看到一句好话 */
export function DailyPoem() {
  const today = useTodayKey()
  const poem = poemOfDay(today)

  return (
    <section className="card poem-card">
      <div className="card-head">
        <div>
          <div className="eyebrow">每日诗词</div>
          <h3 className="card-title poem-title">{poem.title}</h3>
          <div className="card-sub">
            {poem.dynasty} · {poem.author}
          </div>
        </div>
        <span className="num muted" style={{ fontSize: 11.5 }}>
          今日一首
        </span>
      </div>
      <div className="poem-body">
        {poem.lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </section>
  )
}
