import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import TDesign from 'tdesign-vue-next'
import './assets/styles/global.scss'
import 'tdesign-vue-next/es/style/index.css'
import { initStorage } from './services/mockApi'

// 性能优化：页面切到后台时跳过 setInterval 回调，减少无谓的轮询请求与计算。
// 各页面自行清理定时器不受影响（返回的 id 仍可被 clearInterval 清除）。
const _originalSetInterval = window.setInterval.bind(window)
window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: any[]) => {
  const wrapped = typeof handler === 'function'
    ? () => { if (!document.hidden) (handler as (...a: any[]) => void)(...args) }
    : handler
  return _originalSetInterval(wrapped as TimerHandler, timeout)
}) as typeof window.setInterval

initStorage()

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(TDesign)

app.mount('#app')
