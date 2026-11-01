import type { AppData } from '../types'

/**
 * 云同步客户端。
 *
 * 服务端（server/index.mjs）提供：
 *   POST   {base}/auth/register  { email, password } -> { token, user }
 *   POST   {base}/auth/login     { email, password } -> { token, user }
 *   GET    {base}/sync           -> { data, revision, updatedAt }
 *   PUT    {base}/sync           { data, baseRevision } -> { revision, updatedAt }
 *
 * base 默认取同源的 /api；部署到服务器后可以直接填完整地址。
 */

export interface CloudSnapshot {
  data: AppData | null
  revision: number
  updatedAt: string | null
}

export interface CloudAuthResult {
  token: string
  user: { id: string; email: string }
}

export function apiBase(endpoint?: string): string {
  const raw = (endpoint ?? '').trim()
  if (!raw) return '/api'
  return raw.replace(/\/+$/, '')
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `请求失败（${res.status}）`
    throw new Error(msg)
  }
  return body as T
}

function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export async function authRegister(
  endpoint: string | undefined,
  email: string,
  password: string,
): Promise<CloudAuthResult> {
  return request<CloudAuthResult>(`${apiBase(endpoint)}/auth/register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  })
}

export async function authLogin(
  endpoint: string | undefined,
  email: string,
  password: string,
): Promise<CloudAuthResult> {
  return request<CloudAuthResult>(`${apiBase(endpoint)}/auth/login`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  })
}

export async function syncPull(endpoint: string | undefined, token: string): Promise<CloudSnapshot> {
  return request<CloudSnapshot>(`${apiBase(endpoint)}/sync`, { headers: authHeaders(token) })
}

export async function syncPush(
  endpoint: string | undefined,
  token: string,
  data: AppData,
  baseRevision: number,
): Promise<CloudSnapshot> {
  return request<CloudSnapshot>(`${apiBase(endpoint)}/sync`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ data, baseRevision }),
  })
}
