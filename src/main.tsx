import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'
import { AppDataProvider } from './state/store'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppDataProvider>
      <App />
    </AppDataProvider>
  </StrictMode>,
)

// 正式构建后注册离线缓存（开发环境不注册，避免缓存住旧代码）
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
