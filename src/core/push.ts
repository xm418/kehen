import { apiBase } from './storage/cloudAdapter'

/**
 * Web Push 客户端。
 *
 * 服务端（server/index.mjs）提供：
 *   GET  {base}/push/key          -> { publicKey }        （无需鉴权）
 *   POST {base}/push/subscribe    { subscription } -> { ok, count }
 *   POST {base}/push/unsubscribe  { endpoint }     -> { ok, count }
 *   GET  {base}/push/status       -> { subscribed, count }
 *
 * 限制：必须是 HTTPS 或 localhost，并且用户已经登录云同步。
 */

export interface PushState {
  subscribed: boolean
  count: number
}

const UNSUPPORTED =
  '当前环境不支持后台推送：需要用 HTTPS 或 localhost 打开，并且在浏览器里运行'

/** 浏览器是否具备后台推送能力（安全上下文 + Service Worker + Push API） */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  )
}

/** VAPID 公钥是 base64url，订阅时要转成 Uint8Array */
function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

function errorText(body: unknown, status: number): string {
  return body && typeof body === 'object' && 'error' in body
    ? String((body as { error: unknown }).error)
    : `请求失败（${status}）`
}

async function request<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    body: init.body,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) throw new Error(errorText(body, res.status))
  return body as T
}

/** 取服务端 VAPID 公钥（首次启动时由服务端自动生成） */
export async function getPublicKey(endpoint?: string): Promise<string> {
  const res = await fetch(`${apiBase(endpoint)}/push/key`, {
    headers: { Accept: 'application/json' },
  })
  const body = (await res.json().catch(() => null)) as { publicKey?: string; error?: string } | null
  if (!res.ok) throw new Error(body?.error ?? `获取推送公钥失败（${res.status}）`)
  if (!body?.publicKey) throw new Error('服务端没有返回推送公钥')
  return body.publicKey
}

/** 等 Service Worker 就绪；开发环境没有注册 SW 时给个明确的错误而不是一直转圈 */
async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Service Worker 还没就绪：请用正式构建后的页面（HTTPS 或 localhost）再试'))
    }, 15000)
  })
  return Promise.race([navigator.serviceWorker.ready, timeout])
}

/**
 * 开启后台提醒：申请权限 → 等 Service Worker → 订阅 → 上报服务端。
 * 已经订阅过的设备会直接复用浏览器里的那份订阅。
 */
export async function enablePush(
  endpoint: string | undefined,
  token: string,
): Promise<PushSubscriptionJSON> {
  if (!pushSupported()) throw new Error(UNSUPPORTED)
  if (!token) throw new Error('请先登录云同步账号')

  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new Error('浏览器没有允许通知，请放开权限后重试')
  }

  const registration = await readyRegistration()
  const publicKey = await getPublicKey(endpoint)
  const existed = await registration.pushManager.getSubscription()
  const subscription =
    existed ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64Url(publicKey),
    }))

  const json = subscription.toJSON()
  await request(`${apiBase(endpoint)}/push/subscribe`, token, {
    method: 'POST',
    body: JSON.stringify({ subscription: json }),
  })
  return json
}

/** 关闭后台提醒：先通知服务端删除，再取消浏览器里的订阅 */
export async function disablePush(endpoint: string | undefined, token: string): Promise<void> {
  if (!token) throw new Error('请先登录云同步账号')
  if (!pushSupported()) return

  const registration = await readyRegistration()
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  await request(`${apiBase(endpoint)}/push/unsubscribe`, token, {
    method: 'POST',
    body: JSON.stringify({ endpoint: subscription.toJSON().endpoint }),
  })
  await subscription.unsubscribe()
}

/** 查服务端记录：这个账号在几台设备上开了提醒 */
export async function getPushState(
  endpoint: string | undefined,
  token: string,
): Promise<PushState> {
  if (!token) throw new Error('请先登录云同步账号')
  return request<PushState>(`${apiBase(endpoint)}/push/status`, token)
}
