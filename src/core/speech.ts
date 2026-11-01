/**
 * 朗读单词：优先播放在线发音音频（有道词典音源），失败再退回系统 TTS。
 * WebView 里 speechSynthesis 经常没有可用语音引擎，只靠它会「点了完全没声音」。
 */
const audioUrl = (word: string) =>
  `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`

let currentAudio: HTMLAudioElement | null = null

/** 系统 TTS 兜底（没有语音引擎的设备会静默失败，不影响播放音频） */
function speakWithTTS(word: string): void {
  try {
    if (!('speechSynthesis' in window)) return
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(word)
    const voices = synth.getVoices()
    const en =
      voices.find((v) => /^en[-_]US/i.test(v.lang)) ?? voices.find((v) => /^en/i.test(v.lang))
    if (en) u.voice = en
    u.lang = en?.lang || 'en-US'
    u.rate = 0.9
    synth.speak(u)
  } catch {
    /* 不支持就跳过 */
  }
}

export function speakWord(word: string): void {
  const w = word.trim()
  if (!w) return

  if (currentAudio) {
    try {
      currentAudio.pause()
    } catch {
      /* 忽略 */
    }
    currentAudio = null
  }

  if (typeof Audio === 'undefined') {
    speakWithTTS(w)
    return
  }

  const audio = new Audio(audioUrl(w))
  currentAudio = audio
  const played = audio.play()
  if (played && typeof played.catch === 'function') {
    played.catch(() => speakWithTTS(w))
  }
}
