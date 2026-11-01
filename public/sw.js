// 极简离线缓存：只缓存应用外壳，数据全部存在本地
const CACHE = 'kedu-shell-v5'
const SHELL = ['./', './index.html', './icon.svg', './manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  // 同步接口永远走网络，绝不进缓存
  if (new URL(req.url).pathname.startsWith('/api/')) return

  // 页面本身走网络优先，保证重新构建后能拿到新版本
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('./index.html').then((cached) => cached ?? fetch(req)))
    )
    return
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {})
        return res
      })
    })
  )
})

// 后台推送：页面完全关闭时也能收到系统通知
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const title = typeof payload.title === 'string' && payload.title ? payload.title : '刻痕提醒'
  const body = typeof payload.body === 'string' ? payload.body : ''
  const url = typeof payload.url === 'string' && payload.url ? payload.url : '/'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: './icon.svg',
      badge: './icon.svg',
      // 用标题做 tag，同一天同一类提醒只留一条，不会叠一屏
      tag: title,
      data: { url },
    })
  )
})

// 点通知时：优先聚焦已经打开的窗口，否则开一个新页面
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target =
    (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ('focus' in client) return client.focus()
        }
        return self.clients.openWindow(target)
      })
  )
})
