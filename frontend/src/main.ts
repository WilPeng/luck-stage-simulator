import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import TDesign from 'tdesign-vue-next'
import './assets/styles/global.scss'
import 'tdesign-vue-next/es/style/index.css'
import { initStorage } from './services/mockApi'

initStorage()

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(TDesign)

app.mount('#app')
