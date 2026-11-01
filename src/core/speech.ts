/** 用浏览器/系统 TTS 朗读单词（美式英语） */
export function speakWord(word: string): void {
  try {
    if (!('speechSynthesis' in window)) return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(word)
    u.lang = 'en-US'
    u.rate = 0.9
    speechSynthesis.speak(u)
  } catch {
    /* 不支持的设备静默跳过 */
  }
}
