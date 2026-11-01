import { apiBase, endpointReady, ENDPOINT_HINT } from './storage/cloudAdapter'
import { APP_VERSION } from './update'
import { isNativeApp } from './nativeNotify'

export interface FeedbackInput {
  text: string
  contact?: string
}

/** 提交一条用户提议，服务器存在 server/data/feedback.json */
export async function submitFeedback(endpoint: string | undefined, input: FeedbackInput): Promise<void> {
  const text = input.text.trim()
  if (!text) throw new Error('先写点什么再提交')
  if (text.length > 1000) throw new Error('一条建议最多 1000 字')
  if (!endpointReady(endpoint)) throw new Error(ENDPOINT_HINT)

  const res = await fetch(`${apiBase(endpoint)}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      contact: input.contact?.trim() || undefined,
      version: APP_VERSION,
      platform: isNativeApp() ? 'android' : 'web',
    }),
  })
  if (!res.ok) {
    let msg = `提交失败（${res.status}）`
    try {
      const body = (await res.json()) as { error?: string }
      if (body?.error) msg = body.error
    } catch {
      /* 服务器没返回 JSON 就用默认文案 */
    }
    throw new Error(msg)
  }
}
