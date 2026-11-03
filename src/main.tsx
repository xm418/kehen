import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'
import { AppDataProvider } from './state/store'

const rootEl = document.getElementById('root')

if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <AppDataProvider>
        <App />
      </AppDataProvider>
    </StrictMode>,
  )
}

// App 是本地 assets 离线包，不需要 service worker；
// 历史上注册过的 SW 会把旧 index.html 缓存住，这里随手注销掉。
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => void r.unregister())
  }).catch(() => {})
}
