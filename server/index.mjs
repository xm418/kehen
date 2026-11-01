/**
 * 刻痕 · 本地/云端同步服务（零第三方依赖）
 *
 *   node server/index.mjs
 *
 * 同时做两件事：
 *   1. 托管 dist/ 里的单文件前端（手机连同一个 Wi-Fi 直接访问）
 *   2. 提供注册 / 登录 / 数据同步接口
 *
 * 数据落在 server/data.json，推送密钥与订阅在 server/data/ 下。
 * 部署到服务器时把整个 server 目录拷过去即可。
 */
import { createServer } from 'node:http'
import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import webpush from 'web-push'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(ROOT, '..', 'dist')
const DB_FILE = path.join(ROOT, 'data.json')
const DATA_DIR = path.join(ROOT, 'data')
const PUSH_KEYS_FILE = path.join(DATA_DIR, 'push-keys.json')
const PUSH_STORE_FILE = path.join(DATA_DIR, 'push-store.json')
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json')
/** 放更新包和版本说明：server/app/version.json + server/public/*.apk */
const APP_DIR = path.join(ROOT, 'app')
const DOWNLOAD_DIR = path.join(ROOT, 'public')
const PORT = Number(process.env.PORT || 8787)
const TOKEN_DAYS = 30
const MAX_BODY = 20 * 1024 * 1024
const MAX_FILE = 10 * 1024 * 1024
/** VAPID 的联系方式，web-push 要求留一个 mailto: 或 https: 地址 */
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:push@kedu.app'
const PUSH_INTERVAL = 60 * 1000

/** 用户上传的文档：server/files/{userId}/{fileId}，元信息在 db.files */
const FILES_DIR = path.join(ROOT, 'files')

/** @type {{ users: any[], tokens: any[], docs: Record<string, any>, files: Record<string, any[]> }} */
let db = { users: [], tokens: [], docs: {}, files: {} }

async function load() {
  if (!existsSync(DB_FILE)) return
  try {
    const parsed = JSON.parse(await readFile(DB_FILE, 'utf8'))
    db = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      tokens: Array.isArray(parsed.tokens) ? parsed.tokens : [],
      docs: parsed.docs && typeof parsed.docs === 'object' ? parsed.docs : {},
      files: parsed.files && typeof parsed.files === 'object' ? parsed.files : {},
    }
  } catch (err) {
    console.error('读取数据文件失败，将以空库启动：', err.message)
  }
}

let saving = Promise.resolve()
function save() {
  // 串行写入，避免并发覆盖
  saving = saving.then(async () => {
    const tmp = DB_FILE + '.tmp'
    await writeFile(tmp, JSON.stringify(db, null, 2), 'utf8')
    await rename(tmp, DB_FILE)
  })
  return saving
}

/* -------------------------------- 后台推送 -------------------------------- */

/** VAPID 密钥：首次启动生成后落盘，重启复用同一对密钥 */
let vapid = null

/** @type {{ subscriptions: Record<string, any[]>, sent: Record<string, Record<string, string[]>> }} */
let pushStore = { subscriptions: {}, sent: {} }

const writeQueues = new Map()

/** 单文件原子写，按文件串行，避免并发覆盖 */
function saveJson(file, value) {
  const prev = writeQueues.get(file) ?? Promise.resolve()
  const next = prev.catch(() => {}).then(async () => {
    await mkdir(DATA_DIR, { recursive: true })
    const tmp = file + '.tmp'
    await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
    await rename(tmp, file)
  })
  writeQueues.set(file, next)
  return next
}

async function loadPush() {
  try {
    const parsed = JSON.parse(await readFile(PUSH_STORE_FILE, 'utf8'))
    pushStore = {
      subscriptions:
        parsed?.subscriptions && typeof parsed.subscriptions === 'object' ? parsed.subscriptions : {},
      sent: parsed?.sent && typeof parsed.sent === 'object' ? parsed.sent : {},
    }
  } catch {
    // 首次启动没有这个文件，用空库即可
  }
}

async function ensureVapid() {
  try {
    const parsed = JSON.parse(await readFile(PUSH_KEYS_FILE, 'utf8'))
    if (parsed?.publicKey && parsed?.privateKey) vapid = parsed
  } catch {
    // 没有密钥文件就新建一对
  }
  if (!vapid) {
    vapid = webpush.generateVAPIDKeys()
    await saveJson(PUSH_KEYS_FILE, { publicKey: vapid.publicKey, privateKey: vapid.privateKey })
    console.log('[刻痕] 已生成新的推送密钥：server/data/push-keys.json')
  }
  webpush.setVapidDetails(VAPID_SUBJECT, vapid.publicKey, vapid.privateKey)
  return vapid
}

/** 浏览器 PushSubscription.toJSON() 的最小校验 */
function isPushSubscription(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.endpoint === 'string' &&
    /^https?:\/\//.test(value.endpoint) &&
    !!value.keys &&
    typeof value.keys.p256dh === 'string' &&
    typeof value.keys.auth === 'string'
  )
}

/* 时区：所有「今天」都按 Asia/Shanghai 算，避免服务器部署在别处时错位 */
const DAY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const HOUR_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  hourCycle: 'h23',
})

function shanghaiNow(date = new Date()) {
  return { today: DAY_FMT.format(date), hour: Number(HOUR_FMT.format(date)) }
}

function addDaysKey(key, n) {
  const d = new Date(key + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function weekdayOfKey(key) {
  return new Date(key + 'T00:00:00Z').getUTCDay()
}

/** 「每周几次」的习惯在本周已经完成的次数（周一为一周起点） */
function weeklyDone(habit, logs, today) {
  const day = weekdayOfKey(today)
  const weekStart = addDaysKey(today, day === 0 ? -6 : 1 - day)
  let sum = 0
  for (const log of logs) {
    if (log.habitId === habit.id && log.date >= weekStart && log.date <= today) sum += log.count
  }
  return sum
}

/** 今天排期内、还没做完的习惯（与前端 core/supervision.ts 的判定保持一致） */
function todaysOpenHabits(data, today) {
  const day = weekdayOfKey(today)
  const logs = Array.isArray(data.habitLogs) ? data.habitLogs : []
  const done = new Map()
  for (const log of logs) {
    const key = log.habitId + '|' + log.date
    if (!done.has(key)) done.set(key, log.count)
  }
  const habits = Array.isArray(data.habits) ? data.habits : []
  return habits.filter((habit) => {
    if (!habit || habit.archived) return false
    const schedule = habit.schedule ?? { type: 'daily' }
    if (schedule.type === 'weekdays' && !(schedule.days ?? []).includes(day)) return false
    if (schedule.type === 'weekly') {
      // 每周几次只在周日结算，避免天天都被算成没做完
      if (day !== 0) return false
      return weeklyDone(habit, logs, today) < (schedule.times ?? 0)
    }
    return (done.get(habit.id + '|' + today) ?? 0) < (habit.targetPerDay ?? 1)
  })
}

/** 按已同步的数据快照算出今天要发的提醒（每类一条） */
function buildMessages(data, today, tomorrow, hour) {
  if (!data || typeof data !== 'object') return []
  const cfg = data.settings?.supervision
  if (!cfg || cfg.notify !== true) return []
  if (hour < Number(cfg.deadlineHour ?? 21)) return []

  const messages = []

  const open = todaysOpenHabits(data, today)
  if (open.length > 0) {
    const names = open
      .map((h) => h.name)
      .filter(Boolean)
      .slice(0, 3)
      .join('、')
    messages.push({
      kind: 'habit',
      title: '该打卡了',
      body:
        open.length === 1
          ? `${names || '还有一项'} 今天还没做完`
          : `还有 ${open.length} 项没做完：${names}`,
      url: '/',
    })
  }

  const plans = Array.isArray(data.plans) ? data.plans : []
  const plan = plans.find((item) => item && item.date === tomorrow)
  const itemCount = plan && Array.isArray(plan.items) ? plan.items.length : 0
  if (itemCount === 0) {
    messages.push({
      kind: 'plan',
      title: '明天还没写计划',
      body: '睡前花两分钟，把明天要做的事写下来',
      url: '/',
    })
  }

  return messages
}

/** 给某个用户的所有设备发一轮，返回是否改动了存储 */
async function pushToUser(userId, messages, today) {
  const subscriptions = pushStore.subscriptions[userId] ?? []
  if (subscriptions.length === 0) return false

  if (!pushStore.sent[userId]) pushStore.sent[userId] = {}
  const dayMarks = pushStore.sent[userId]
  if (!dayMarks[today]) dayMarks[today] = []
  const marks = dayMarks[today]

  let changed = false
  for (const message of messages) {
    if (marks.includes(message.kind)) continue
    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url: message.url,
    })
    const stale = []
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(subscription, payload, { TTL: 3600 })
      } catch (err) {
        const code = err?.statusCode
        if (code === 404 || code === 410) {
          // 订阅已失效，从存储里删掉
          stale.push(subscription.endpoint)
        } else {
          console.error(`[刻痕] 推送失败（${code ?? 'unknown'}）：`, err?.message ?? err)
        }
      }
    }
    if (stale.length > 0) {
      const remaining = (pushStore.subscriptions[userId] ?? []).filter(
        (item) => !stale.includes(item.endpoint),
      )
      if (remaining.length > 0) pushStore.subscriptions[userId] = remaining
      else delete pushStore.subscriptions[userId]
      changed = true
    }
    marks.push(message.kind)
    changed = true
  }
  return changed
}

let pushing = false

/** 每 60 秒跑一次；不阻塞任何请求，任何异常都不能让定时器停掉 */
async function runPushCheck() {
  if (pushing || !vapid) return
  pushing = true
  try {
    const { today, hour } = shanghaiNow()
    const tomorrow = addDaysKey(today, 1)
    let changed = false

    for (const [userId, subscriptions] of Object.entries(pushStore.subscriptions)) {
      if (!Array.isArray(subscriptions) || subscriptions.length === 0) continue
      const data = db.docs[userId]?.data
      if (!data) continue
      const messages = buildMessages(data, today, tomorrow, hour)
      if (messages.length === 0) continue
      try {
        if (await pushToUser(userId, messages, today)) changed = true
      } catch (err) {
        console.error(`[刻痕] 处理用户 ${userId} 的推送时出错：`, err?.message ?? err)
      }
    }

    // 已发标记只留最近 7 天，避免文件无限增长
    const keepFrom = addDaysKey(today, -7)
    for (const [userId, days] of Object.entries(pushStore.sent)) {
      for (const date of Object.keys(days)) {
        if (date < keepFrom) {
          delete days[date]
          changed = true
        }
      }
      if (Object.keys(days).length === 0) {
        delete pushStore.sent[userId]
        changed = true
      }
    }

    if (changed) await saveJson(PUSH_STORE_FILE, pushStore)
  } finally {
    pushing = false
  }
}

setInterval(() => {
  runPushCheck().catch((err) => {
    console.error('[刻痕] 定时推送检查失败：', err?.message ?? err)
  })
}, PUSH_INTERVAL)

/* ------------------------------ 推送接口实现 ------------------------------ */

async function handlePushSubscribe(req, res, user) {
  const body = await readBody(req)
  if (!isPushSubscription(body.subscription)) return send(res, 400, { error: '订阅信息不完整' })
  const subscription = body.subscription
  const list = pushStore.subscriptions[user.id] ?? []
  const index = list.findIndex((item) => item.endpoint === subscription.endpoint)
  if (index >= 0) list[index] = subscription
  else list.push(subscription)
  pushStore.subscriptions[user.id] = list
  await saveJson(PUSH_STORE_FILE, pushStore)
  return send(res, 200, { ok: true, count: list.length })
}

async function handlePushUnsubscribe(req, res, user) {
  const body = await readBody(req)
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  if (!endpoint) return send(res, 400, { error: '缺少 endpoint' })
  const remaining = (pushStore.subscriptions[user.id] ?? []).filter(
    (item) => item.endpoint !== endpoint,
  )
  if (remaining.length > 0) pushStore.subscriptions[user.id] = remaining
  else delete pushStore.subscriptions[user.id]
  await saveJson(PUSH_STORE_FILE, pushStore)
  return send(res, 200, { ok: true, count: remaining.length })
}

async function handlePush(req, res, pathname) {
  // 公钥给前端订阅用，不需要登录
  if (pathname === '/api/push/key') {
    if (req.method !== 'GET') return send(res, 405, { error: '不支持的请求方法' })
    if (!vapid) return send(res, 503, { error: '推送密钥还没准备好' })
    return send(res, 200, { publicKey: vapid.publicKey })
  }

  const user = currentUser(req)
  if (!user) return send(res, 401, { error: '登录已失效，请重新登录' })

  if (pathname === '/api/push/status') {
    if (req.method !== 'GET') return send(res, 405, { error: '不支持的请求方法' })
    const count = (pushStore.subscriptions[user.id] ?? []).length
    return send(res, 200, { subscribed: count > 0, count })
  }

  if (pathname === '/api/push/subscribe') {
    if (req.method !== 'POST') return send(res, 405, { error: '不支持的请求方法' })
    return handlePushSubscribe(req, res, user)
  }

  if (pathname === '/api/push/unsubscribe') {
    if (req.method !== 'POST') return send(res, 405, { error: '不支持的请求方法' })
    return handlePushUnsubscribe(req, res, user)
  }

  return send(res, 404, { error: 'Not Found' })
}

function send(res, status, payload) {
  const body = payload === undefined ? '' : JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) return resolve({})
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(new Error('JSON 解析失败'))
      }
    })
    req.on('error', reject)
  })
}

const pad = (n) => (n < 10 ? '0' + n : '' + n)
const nowISO = () => new Date().toISOString()
const normEmail = (value) => String(value || '').trim().toLowerCase()

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex')
}

function issueToken(userId) {
  const token = randomBytes(24).toString('hex')
  db.tokens = db.tokens.filter((t) => new Date(t.expiresAt).getTime() > Date.now())
  db.tokens.push({
    token,
    userId,
    expiresAt: new Date(Date.now() + TOKEN_DAYS * 86400000).toISOString(),
  })
  return token
}

function currentUser(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  const row = db.tokens.find((t) => t.token === token)
  if (!row) return null
  if (new Date(row.expiresAt).getTime() <= Date.now()) return null
  return db.users.find((u) => u.id === row.userId) ?? null
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

async function serveStatic(res, urlPath) {
  const clean = urlPath === '/' ? '/index.html' : urlPath
  const file = path.join(DIST, path.normalize(clean).replace(/^(\.\.[/\\])+/, ''))
  if (!existsSync(file)) {
    send(res, 404, { error: '前端还没构建，请先运行 npm run build' })
    return
  }
  const body = await readFile(file)
  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  })
  res.end(body)
}

/** 注册 / 登录共用 */
async function handleAuth(req, res, mode) {
  const body = await readBody(req)
  const email = normEmail(body.email)
  const password = String(body.password || '')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: '邮箱格式不正确' })
  if (password.length < 6) return send(res, 400, { error: '密码至少 6 位' })

  const existing = db.users.find((u) => u.email === email)
  if (mode === 'register') {
    if (existing) return send(res, 409, { error: '这个邮箱已经注册过了' })
    const salt = randomBytes(16).toString('hex')
    const user = {
      id: randomBytes(8).toString('hex'),
      email,
      salt,
      passwordHash: hashPassword(password, salt),
      createdAt: nowISO(),
    }
    db.users.push(user)
    const token = issueToken(user.id)
    await save()
    return send(res, 200, { token, user: { id: user.id, email: user.email } })
  }

  if (!existing) return send(res, 401, { error: '邮箱或密码不正确' })
  const attempt = Buffer.from(hashPassword(password, existing.salt), 'hex')
  const stored = Buffer.from(existing.passwordHash, 'hex')
  const ok = attempt.length === stored.length && timingSafeEqual(attempt, stored)
  if (!ok) return send(res, 401, { error: '邮箱或密码不正确' })
  const token = issueToken(existing.id)
  await save()
  return send(res, 200, { token, user: { id: existing.id, email: existing.email } })
}

async function handleSync(req, res, user) {
  const doc = db.docs[user.id] ?? { revision: 0, updatedAt: null, data: null }

  if (req.method === 'GET') {
    return send(res, 200, doc)
  }

  if (req.method === 'PUT') {
    const body = await readBody(req)
    const data = body.data
    if (!data || typeof data !== 'object' || !Array.isArray(data.habits)) {
      return send(res, 400, { error: '数据格式不正确' })
    }
    // 老版本客户端不认识 words 字段，整包推送时会把云端词库清空。
    // 只有「本次推送一个词都没有」时才保留云端已有的词；正常增删（非空）依然生效。
    if (!Array.isArray(data.words) || data.words.length === 0) {
      const prevWords = doc.data && Array.isArray(doc.data.words) ? doc.data.words : null
      if (prevWords && prevWords.length > 0) data.words = prevWords
    }
    const base = Number(body.baseRevision ?? 0)
    if (doc.revision !== base) {
      return send(res, 409, {
        error: '云端数据已被其他设备更新，请重新同步',
        data: doc.data,
        revision: doc.revision,
        updatedAt: doc.updatedAt,
      })
    }
    const next = { revision: doc.revision + 1, updatedAt: nowISO(), data }
    db.docs[user.id] = next
    await save()
    return send(res, 200, next)
  }

  return send(res, 405, { error: '不支持的请求方法' })
}

/** 用户提议：追加到 server/data/feedback.json，只留最近 2000 条 */
async function handleFeedback(req, res) {
  const body = await readBody(req)
  const text = String(body.text || '').trim()
  if (!text) return send(res, 400, { error: '内容不能为空' })
  if (text.length > 1000) return send(res, 400, { error: '一条提议最多 1000 字' })

  let list = []
  if (existsSync(FEEDBACK_FILE)) {
    try {
      list = JSON.parse(await readFile(FEEDBACK_FILE, 'utf8'))
    } catch {
      list = []
    }
  }
  list.push({
    id: randomBytes(6).toString('hex'),
    at: nowISO(),
    text,
    contact: String(body.contact || '').slice(0, 60) || null,
    version: String(body.version || '').slice(0, 20) || null,
    platform: String(body.platform || '').slice(0, 20) || null,
  })
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(FEEDBACK_FILE, JSON.stringify(list.slice(-2000), null, 2), 'utf8')
  return send(res, 200, { ok: true })
}

/* ------------------------------ 文档文件接口 ------------------------------ */

function fileMetas(userId) {
  if (!Array.isArray(db.files[userId])) db.files[userId] = []
  return db.files[userId]
}

/** POST /api/files { name, mime, data(base64) } -> meta */
async function handleFileUpload(req, res, user) {
  const body = await readBody(req)
  const name = String(body.name || '').trim().slice(0, 120)
  const mime = String(body.mime || 'application/octet-stream').slice(0, 120)
  const raw = String(body.data || '')
  if (!name) return send(res, 400, { error: '文件名不能为空' })
  if (!raw) return send(res, 400, { error: '文件内容为空' })
  const buf = Buffer.from(raw, 'base64')
  if (buf.length === 0) return send(res, 400, { error: '文件内容为空' })
  if (buf.length > MAX_FILE) return send(res, 400, { error: '单个文件最大 10MB' })

  const id = randomBytes(8).toString('hex')
  const dir = path.join(FILES_DIR, user.id)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, id), buf)

  const meta = { id, name, mime, size: buf.length, uploadedAt: nowISO() }
  fileMetas(user.id).push(meta)
  await save()
  return send(res, 200, meta)
}

/** GET /api/files -> { files: [...meta] } / GET /api/files/{id} -> 二进制 */
async function handleFileGet(req, res, user, id) {
  if (!id) return send(res, 200, { files: fileMetas(user.id) })
  const meta = fileMetas(user.id).find((f) => f.id === id)
  if (!meta) return send(res, 404, { error: '文件不存在' })
  const file = path.join(FILES_DIR, user.id, id)
  if (!existsSync(file)) return send(res, 404, { error: '文件已被清理' })
  const body = await readFile(file)
  res.writeHead(200, {
    'Content-Type': meta.mime,
    'Content-Length': body.length,
    'Content-Disposition': `attachment; filename="file"; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(body)
}

/** DELETE /api/files/{id} */
async function handleFileDelete(res, user, id) {
  const metas = fileMetas(user.id)
  const idx = metas.findIndex((f) => f.id === id)
  if (idx < 0) return send(res, 404, { error: '文件不存在' })
  metas.splice(idx, 1)
  await unlink(path.join(FILES_DIR, user.id, id)).catch(() => {})
  await save()
  return send(res, 200, { ok: true })
}

/* ------------------------------ 词典代理 ------------------------------ */

/**
 * GET /api/dict?word=xxx —— 代理 dictionaryapi.dev，给导入的单词补音标/释义。
 * 需要登录；6 秒超时；查不到就回 { ok:false }，前端留空不挡导入。
 */
async function handleDict(req, res, user) {
  void user
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const word = String(url.searchParams.get('word') || '').trim().toLowerCase()
  if (!/^[a-z][a-z'-]*$/.test(word)) return send(res, 400, { error: '单词格式不正确' })
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'kedu-app/1.6' },
    })
    if (!r.ok) return send(res, 200, { ok: false })
    const json = await r.json()
    const entry = Array.isArray(json) ? json[0] : null
    if (!entry) return send(res, 200, { ok: false })
    const phonetic =
      entry.phonetic ||
      (Array.isArray(entry.phonetics)
        ? (entry.phonetics.find((p) => p && p.text)?.text ?? '')
        : '')
    const audio = Array.isArray(entry.phonetics)
      ? (entry.phonetics.find((p) => p && p.audio)?.audio ?? '')
      : ''
    let meaning = ''
    let example = ''
    if (Array.isArray(entry.meanings)) {
      for (const m of entry.meanings) {
        if (!meaning) {
          const def = m?.definitions?.[0]?.definition
          if (def) meaning = `${m.partOfSpeech ? m.partOfSpeech + '. ' : ''}${def}`
        }
        if (!example && Array.isArray(m?.definitions)) {
          const ex = m.definitions.find((d) => d && d.example)?.example
          if (ex) example = ex
        }
        if (meaning && example) break
      }
    }
    return send(res, 200, {
      ok: true,
      phonetic: phonetic || '',
      audio: audio || '',
      meaning: meaning || '',
      example: example || '',
    })
  } catch {
    return send(res, 200, { ok: false })
  } finally {
    clearTimeout(timer)
  }
}

/** 版本信息：server/app/version.json，改这个文件就能推更新 */
async function handleVersion(res) {
  const file = path.join(APP_DIR, 'version.json')
  if (!existsSync(file)) return send(res, 404, { error: '服务器还没放 version.json' })
  const info = JSON.parse(await readFile(file, 'utf8'))
  return send(res, 200, info)
}

/** 安装包下载：/download/xxx.apk 对应 server/public/xxx.apk */
async function serveDownload(res, urlPath) {
  const name = decodeURIComponent(urlPath.slice('/download/'.length))
  const file = path.join(DOWNLOAD_DIR, path.basename(name))
  if (!existsSync(file)) return send(res, 404, { error: '安装包不存在' })
  const body = await readFile(file)
  res.writeHead(200, {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Length': body.length,
    'Content-Disposition': `attachment; filename="${path.basename(file)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
      'Access-Control-Max-Age': '86400',
    })
    return res.end()
  }

  if (url.pathname === '/api/health') {
    return send(res, 200, { ok: true, time: nowISO(), users: db.users.length })
  }

  if (url.pathname.startsWith('/api/push/')) {
    return handlePush(req, res, url.pathname).catch((err) => send(res, 400, { error: err.message }))
  }

  if (url.pathname === '/api/auth/register' && req.method === 'POST') {
    return handleAuth(req, res, 'register').catch((err) => send(res, 400, { error: err.message }))
  }

  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    return handleAuth(req, res, 'login').catch((err) => send(res, 400, { error: err.message }))
  }

  if (url.pathname === '/api/app/version' && req.method === 'GET') {
    return handleVersion(res).catch((err) => send(res, 500, { error: err.message }))
  }

  if (url.pathname === '/api/feedback' && req.method === 'POST') {
    return handleFeedback(req, res).catch((err) => send(res, 400, { error: err.message }))
  }

  if (url.pathname.startsWith('/download/') && req.method === 'GET') {
    return serveDownload(res, url.pathname).catch(() => send(res, 500, { error: '读取安装包失败' }))
  }

  if (url.pathname === '/api/files' || url.pathname.startsWith('/api/files/')) {
    const user = currentUser(req)
    if (!user) return send(res, 401, { error: '登录已失效，请重新登录' })
    const id = decodeURIComponent(url.pathname.slice('/api/files/'.length)).replace(/[^0-9a-f]/g, '')
    if (req.method === 'POST' && url.pathname === '/api/files') {
      return handleFileUpload(req, res, user).catch((err) => send(res, 400, { error: err.message }))
    }
    if (req.method === 'GET') {
      return handleFileGet(req, res, user, url.pathname === '/api/files' ? '' : id).catch(() =>
        send(res, 500, { error: '读取文件失败' }),
      )
    }
    if (req.method === 'DELETE' && id) {
      return handleFileDelete(res, user, id).catch((err) => send(res, 400, { error: err.message }))
    }
    return send(res, 405, { error: '不支持的请求方法' })
  }

  if (url.pathname === '/api/dict' && req.method === 'GET') {
    const user = currentUser(req)
    if (!user) return send(res, 401, { error: '登录已失效，请重新登录' })
    return handleDict(req, res, user).catch(() => send(res, 200, { ok: false }))
  }

  if (url.pathname === '/api/sync') {
    const user = currentUser(req)
    if (!user) return send(res, 401, { error: '登录已失效，请重新登录' })
    return handleSync(req, res, user).catch((err) => send(res, 400, { error: err.message }))
  }

  if (req.method === 'GET') {
    return serveStatic(res, url.pathname).catch(() => send(res, 500, { error: '读取文件失败' }))
  }

  return send(res, 404, { error: 'Not Found' })
})

await load()
await loadPush()
try {
  await ensureVapid()
} catch (err) {
  console.error('[刻痕] 推送密钥初始化失败，后台推送将不可用：', err?.message ?? err)
}
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[刻痕] 服务已启动：http://localhost:${PORT}`)
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log(`[刻痕] 手机可在同一 Wi-Fi 下访问：http://${addr.address}:${PORT}`)
      }
    }
  }
  if (!existsSync(path.join(DIST, 'index.html'))) {
    console.log('[刻痕] 提示：还没有构建前端，先运行 npm run build')
  }
  console.log(`[刻痕] ${pad(new Date().getHours())}:${pad(new Date().getMinutes())} 就绪`)
})
