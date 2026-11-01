/**
 * 朗读单词：优先播放在线发音音频（有道词典音源），失败再退回系统 TTS。
 * WebView 里 speechSynthesis 经常没有可用语音引擎，只靠它会「点了完全没声音」。
 */
export type WordAccent = 'us' | 'uk'

/** 发音偏好只存本机，换设备按默认美音、正常语速 */
export interface WordVoice {
  accent: WordAccent
  /** 播放速度，1 是正常 */
  rate: number
}

const VOICE_KEY = 'kedu:wordVoice'

export function readWordVoice(): WordVoice {
  try {
    const raw = JSON.parse(localStorage.getItem(VOICE_KEY) || 'null') as Partial<WordVoice> | null
    return {
      accent: raw?.accent === 'uk' ? 'uk' : 'us',
      rate: typeof raw?.rate === 'number' && raw.rate >= 0.6 && raw.rate <= 1.3 ? raw.rate : 1,
    }
  } catch {
    return { accent: 'us', rate: 1 }
  }
}

export function writeWordVoice(voice: WordVoice): void {
  try {
    localStorage.setItem(VOICE_KEY, JSON.stringify(voice))
  } catch {
    /* 存不了就按默认播 */
  }
}

/** 有道音源：type=1 英音，type=2 美音 */
const audioUrl = (word: string, accent: WordAccent) =>
  `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${accent === 'uk' ? 1 : 2}`

let currentAudio: HTMLAudioElement | null = null

/** 系统 TTS 兜底（没有语音引擎的设备会静默失败，不影响播放音频） */
function speakWithTTS(word: string, voice: WordVoice): void {
  try {
    if (!('speechSynthesis' in window)) return
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(word)
    const voices = synth.getVoices()
    const en =
      voices.find((v) => new RegExp(`^en[-_]${voice.accent.toUpperCase()}`, 'i').test(v.lang)) ??
      voices.find((v) => /^en/i.test(v.lang))
    if (en) u.voice = en
    u.lang = en?.lang || (voice.accent === 'uk' ? 'en-GB' : 'en-US')
    u.rate = voice.rate * 0.9
    synth.speak(u)
  } catch {
    /* 不支持就跳过 */
  }
}

export function speakWord(word: string): void {
  const w = word.trim()
  if (!w) return
  const voice = readWordVoice()

  if (currentAudio) {
    try {
      currentAudio.pause()
    } catch {
      /* 忽略 */
    }
    currentAudio = null
  }

  if (typeof Audio === 'undefined') {
    speakWithTTS(w, voice)
    return
  }

  const audio = new Audio(audioUrl(w, voice.accent))
  audio.playbackRate = voice.rate
  currentAudio = audio
  const played = audio.play()
  if (played && typeof played.catch === 'function') {
    played.catch(() => speakWithTTS(w, voice))
  }
}
