<template>
  <div class="login-page admin">
    <div class="background-effects">
      <div class="spotlight spotlight-1"></div>
      <div class="spotlight spotlight-2"></div>
    </div>

    <t-card class="login-card" :bordered="false">
      <div class="card-header">
        <span class="logo-icon">🛠️</span>
        <h1 class="title">Big Brother 管理后台</h1>
        <p class="subtitle">管理员登录 · 使用管理员账号与密码</p>
      </div>

      <div class="login-form">
        <t-space direction="vertical" :size="16" class="form-space">
          <div class="form-group">
            <label class="form-label">管理员账号</label>
            <t-input
              v-model="username"
              placeholder="请输入管理员账号"
              autocomplete="username"
              :disabled="isLoading"
              size="large"
              @enter="handleLogin"
            />
          </div>
          <div class="form-group">
            <label class="form-label">密码</label>
            <t-input
              v-model="password"
              type="password"
              placeholder="请输入密码"
              autocomplete="current-password"
              :disabled="isLoading"
              size="large"
              @enter="handleLogin"
            />
          </div>

          <div class="remember-row">
            <label class="remember-item">
              <input type="checkbox" v-model="rememberAccount" />
              <span>记住账号</span>
            </label>
            <label class="remember-item">
              <input type="checkbox" v-model="rememberPassword" />
              <span>记住密码（自动登录）</span>
            </label>
          </div>

          <t-button
            :loading="isLoading"
            theme="primary"
            variant="base"
            size="large"
            block
            class="login-btn"
            @click="handleLogin"
          >
            {{ isLoading ? '登录中...' : '进入管理后台' }}
          </t-button>
        </t-space>

        <t-alert v-if="error" :message="error" theme="error" class="alert-message" />
        <t-alert v-if="success" :message="success" theme="success" class="alert-message" />
      </div>

      <div class="footer-links">
        <t-link theme="primary" @click="goPlayerLogin">← 返回选手登录</t-link>
      </div>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useBbAuthStore } from '../../stores/bbAuthStore'
import { useRouter, useRoute } from 'vue-router'

const authStore = useBbAuthStore()
const router = useRouter()
const route = useRoute()

const SAVED_KEY = 'bigbrother_saved_admin'

const username = ref('')
const password = ref('')
const rememberAccount = ref(true)
const rememberPassword = ref(false)
const isLoading = ref(false)
const error = ref('')
const success = ref('')

function goPlayerLogin() {
  router.push('/games/bigbrother/login')
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    if (!raw) return null
    return JSON.parse(raw) as { username: string; password: string; rememberPassword: boolean }
  } catch { return null }
}

function saveSaved() {
  try {
    if (rememberAccount.value && username.value.trim()) {
      localStorage.setItem(SAVED_KEY, JSON.stringify({
        username: username.value.trim(),
        password: rememberPassword.value ? password.value : '',
        rememberPassword: rememberPassword.value
      }))
    } else {
      localStorage.removeItem(SAVED_KEY)
    }
  } catch {}
}

async function handleLogin() {
  if (!username.value.trim() || !password.value) {
    error.value = '请输入账号和密码'
    success.value = ''
    return
  }
  isLoading.value = true
  error.value = ''
  success.value = ''
  try {
    const result = await authStore.adminLogin(username.value.trim(), password.value)
    if (!result.user || result.user.role !== 'admin') {
      error.value = '该账号不是管理员'
      return
    }
    saveSaved()
    success.value = '登录成功，正在进入...'
    await new Promise((resolve) => setTimeout(resolve, 400))
    await router.replace((route.query.redirect as string) || '/games/bigbrother/admin/dashboard')
  } catch (err: any) {
    error.value = err.message || '登录失败，请稍后重试'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  const saved = loadSaved()
  if (!saved) return
  username.value = saved.username || ''
  rememberPassword.value = !!saved.rememberPassword
  if (saved.rememberPassword && saved.password) {
    // 仅自动填充账号密码，不自动发送登录请求
    password.value = saved.password
  }
})
</script>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a0a0a 0%, #2a1a1a 50%, #1a0a12 100%);
  position: relative;
  overflow: hidden;
  padding: 20px;
}

.background-effects { position: absolute; inset: 0; pointer-events: none; }
.spotlight {
  position: absolute; width: 400px; height: 400px; border-radius: 50%; opacity: 0.12;
  &.spotlight-1 { top: -100px; right: -100px; background: radial-gradient(circle, #ff6b6b 0%, transparent 70%); }
  &.spotlight-2 { bottom: -100px; left: -100px; background: radial-gradient(circle, #ffaa00 0%, transparent 70%); }
}

.login-card {
  background: rgba(255, 255, 255, 0.08) !important;
  backdrop-filter: blur(20px);
  border-radius: 24px !important;
  padding: 48px;
  width: 100%;
  max-width: 400px;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  position: relative;
  z-index: 1;
}

.card-header { text-align: center; margin-bottom: 32px; }
.logo-icon { font-size: 48px; display: block; margin-bottom: 16px; }
.title {
  color: #fff; font-size: 24px; font-weight: 700; margin: 0 0 8px 0;
  background: linear-gradient(135deg, #ffd700, #ff6b6b);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.subtitle { color: rgba(255, 255, 255, 0.6); font-size: 14px; margin: 0; }
.login-form { display: flex; flex-direction: column; gap: 16px; }
.form-space { width: 100%; }
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-label { color: rgba(255, 255, 255, 0.7); font-size: 14px; font-weight: 500; }
.alert-message { margin-top: 8px; }
.remember-row { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; font-size: 13px; color: rgba(255, 255, 255, 0.7); }
.remember-item { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }
.remember-item input { accent-color: #ffaa00; width: 15px; height: 15px; }
.footer-links { margin-top: 24px; text-align: center; font-size: 13px; }

::deep(.t-input) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
  .t-input__inner { color: #fff; &::placeholder { color: rgba(255, 255, 255, 0.4); } }
  &.t-is-focused { border-color: #ffaa00; box-shadow: 0 0 20px rgba(255, 170, 0, 0.3); }
}

::deep(.login-btn) {
  background: linear-gradient(135deg, #ff6b6b, #ffaa00) !important;
  border: none !important;
  color: #fff !important;
}
</style>
