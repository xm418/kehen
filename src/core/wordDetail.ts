import { wordDetailLookup, type WordDetail } from './storage/cloudAdapter'

export type { WordDetail }

/** 本机缓存：词条详情按单词存，离线也能看查过的词 */
const PREFIX = 'kedu:wd:'

export function readCachedDetail(word: string): WordDetail | null {
  try {
    const raw = localStorage.getItem(PREFIX + word.toLowerCase())
    if (!raw) return null
    const d = JSON.parse(raw) as WordDetail
    return Array.isArray(d?.entries) && d.entries.length > 0 ? d : null
  } catch {
    return null
  }
}

function writeCachedDetail(d: WordDetail) {
  try {
    localStorage.setItem(PREFIX + d.word.toLowerCase(), JSON.stringify(d))
  } catch {
    // 容量满了：清掉旧缓存，下次重新查
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(PREFIX)) localStorage.removeItem(k)
      }
      localStorage.setItem(PREFIX + d.word.toLowerCase(), JSON.stringify(d))
    } catch {
      /* 忽略 */
    }
  }
}

/** 同一单词并发查询只发一次请求 */
const pending = new Map<string, Promise<WordDetail | null>>()

export async function loadWordDetail(
  endpoint: string | undefined,
  word: string,
): Promise<WordDetail | null> {
  const key = word.trim().toLowerCase()
  const cached = readCachedDetail(key)
  if (cached) return cached
  const running = pending.get(key)
  if (running) return running

  const task = wordDetailLookup(endpoint, key)
    .then((d) => {
      if (d) writeCachedDetail(d)
      return d
    })
    .finally(() => pending.delete(key))
  pending.set(key, task)
  return task
}
