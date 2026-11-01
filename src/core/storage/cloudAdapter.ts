import { Capacitor } from '@capacitor/core'
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

/** 安装包里没有同源服务器，相对地址会指向 https://localhost，所以必须填完整地址 */
export function endpointReady(endpoint?: string): boolean {
  return !!(endpoint ?? '').trim() || !Capacitor.isNativePlatform()
}

export const ENDPOINT_HINT = '先在「账号与同步」里填上服务器地址，例如 http://192.168.0.101:8787/api'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10000)
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('连不上服务器（10 秒无响应）。请用手机浏览器打开服务器地址试试，打不开说明手机没和电脑连在同一个 Wi-Fi')
    }
    throw new Error('连不上服务器。请确认手机和电脑在同一个 Wi-Fi，地址没填错')
  } finally {
    clearTimeout(timer)
  }
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

/* ------------------------------ 文档文件 ------------------------------ */

export interface CloudFileMeta {
  id: string
  name: string
  mime: string
  size: number
  uploadedAt: string
}

export async function fileUpload(
  endpoint: string | undefined,
  token: string,
  file: { name: string; mime: string; data: string },
): Promise<CloudFileMeta> {
  return request<CloudFileMeta>(`${apiBase(endpoint)}/files`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(file),
  })
}

export async function fileList(
  endpoint: string | undefined,
  token: string,
): Promise<CloudFileMeta[]> {
  const res = await request<{ files: CloudFileMeta[] }>(`${apiBase(endpoint)}/files`, {
    headers: authHeaders(token),
  })
  return res.files ?? []
}

export async function fileDelete(endpoint: string | undefined, token: string, id: string) {
  return request<{ ok: boolean }>(`${apiBase(endpoint)}/files/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
}

/** 词典查询：给导入的单词补音标/释义，查不到返回 null */
export interface DictResult {
  phonetic: string
  audio: string
  meaning: string
  example: string
}

export async function dictLookup(
  endpoint: string | undefined,
  token: string,
  word: string,
): Promise<DictResult | null> {
  try {
    const res = await request<{
      ok: boolean
      phonetic?: string
      audio?: string
      meaning?: string
      example?: string
    }>(`${apiBase(endpoint)}/dict?word=${encodeURIComponent(word)}`, { headers: authHeaders(token) })
    if (!res.ok) return null
    return {
      phonetic: res.phonetic ?? '',
      audio: res.audio ?? '',
      meaning: res.meaning ?? '',
      example: res.example ?? '',
    }
  } catch {
    return null
  }
}

/** 词条详情：词性、词义、同义、反义、例句、词形 */
export interface WordDetail {
  word: string
  phonetic: string
  /** 每个词性一组义项，如 [{ pos:'adj.', senses:['根本的，彻底的','激进的'] }] */
  entries: { pos: string; senses: string[] }[]
  synonyms: { pos: string; words: string[]; tran: string }[]
  antonyms: { pos: string; words: string[] }[]
  sentences: { en: string; zh: string }[]
  forms: { name: string; value: string }[]
}

/** 服务端 /api/word 会缓存词典结果，查不到返回 null */
export async function wordDetailLookup(
  endpoint: string | undefined,
  word: string,
): Promise<WordDetail | null> {
  try {
    const res = await request<Partial<WordDetail> & { ok: boolean }>(
      `${apiBase(endpoint)}/word?q=${encodeURIComponent(word)}`,
    )
    if (!res.ok) return null
    return {
      word: res.word ?? word,
      phonetic: res.phonetic ?? '',
      entries: res.entries ?? [],
      synonyms: res.synonyms ?? [],
      antonyms: res.antonyms ?? [],
      sentences: res.sentences ?? [],
      forms: res.forms ?? [],
    }
  } catch {
    return null
  }
}

/** 下载返回二进制，不能走 request()（它会按 JSON 解析） */
export async function fileDownload(
  endpoint: string | undefined,
  token: string,
  id: string,
): Promise<Blob> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  let res: Response
  try {
    res = await fetch(`${apiBase(endpoint)}/files/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    })
  } catch {
    throw new Error('连不上服务器，文件没下载下来')
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(res.status === 404 ? '服务器上已经没有这个文件了' : `下载失败（${res.status}）`)
  return res.blob()
}
