<template>
  <div class="login-page">
    <div class="background-effects">
      <div class="star star-1"></div>
      <div class="star star-2"></div>
      <div class="star star-3"></div>
      <div class="star star-4"></div>
      <div class="star star-5"></div>
      <div class="spotlight spotlight-1"></div>
      <div class="spotlight spotlight-2"></div>
    </div>

    <t-card class="login-card" :bordered="false">
      <div class="card-header">
        <span class="logo-icon">🎤</span>
        <h1 class="title">乘风2026运气赛</h1>
        <p class="subtitle">输入你的专属登录码，进入本轮舞台</p>
      </div>

      <div class="login-form">
        <t-space direction="vertical" :size="16" class="form-space">
          <div class="form-group">
            <label class="form-label">登录码</label>
            <t-input
              v-model="loginCode"
              placeholder="请输入登录码"
              autocomplete="off"
              :disabled="isLoading"
              size="large"
              @enter="handleLogin"
            />
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
            <template v-if="isLoading" #icon>
              <span class="loading-icon">⏳</span>
            </template>
            {{ isLoading ? '登录中...' : '进入舞台' }}
          </t-button>
        </t-space>

        <t-alert v-if="error" :message="error" theme="error" class="alert-message" />
        <t-alert v-if="success" :message="success" theme="success" class="alert-message" />
      </div>

      <div v-if="recentCodes.length > 0" class="recent-codes">
        <p class="recent-title">最近登录：</p>
        <div class="code-list">
          <t-link
            v-for="code in recentCodes"
            :key="code"
            @click="fillCode(code)"
            class="code-item"
          >
            {{ code }}
          </t-link>
        </div>
      </div>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../../stores/authStore'
import { useRouter, useRoute } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const LOGIN_CODES_KEY = 'luck_sim_recent_codes'
const MAX_RECENT_CODES = 10

const loginCode = ref('')
const isLoading = ref(false)
const error = ref('')
const success = ref('')
const recentCodes = ref<string[]>([])

// 加载最近登录码
function loadRecentCodes() {
  try {
    const stored = localStorage.getItem(LOGIN_CODES_KEY)
    recentCodes.value = stored ? JSON.parse(stored) : []
  } catch {
    recentCodes.value = []
  }
}

// 保存登录码到最近列表
function saveRecentCode(code: string) {
  const list = recentCodes.value.filter(c => c !== code)
  list.unshift(code)
  if (list.length > MAX_RECENT_CODES) list.length = MAX_RECENT_CODES
  recentCodes.value = list
  localStorage.setItem(LOGIN_CODES_KEY, JSON.stringify(list))
}

function fillCode(code: string) {
  loginCode.value = code
}

async function handleLogin() {
  const trimmed = loginCode.value.trim()
  if (!trimmed) {
    error.value = '请输入登录码'
    success.value = ''
    return
  }

  isLoading.value = true
  error.value = ''
  success.value = ''

  try {
    const result = await authStore.login(trimmed)

    if (!result) {
      error.value = '登录码不存在，请检查后重新输入'
      return
    }

    // 登录成功，保存登录码到最近列表
    saveRecentCode(trimmed)

    success.value = '登录成功，正在进入舞台...'
    await new Promise((resolve) => setTimeout(resolve, 500))

    const redirect = (route.query.redirect as string) ||
      (result.user.role === 'admin' ? '/admin/dashboard' : '/player/home')
    await router.replace(redirect)
  } catch (err) {
    error.value = '登录失败，请稍后重试'
    console.error('Login error:', err)
  } finally {
    isLoading.value = false
  }
}

// 初始化加载最近登录码
loadRecentCodes()
</script>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 50%, #0a0a2a 100%);
  position: relative;
  overflow: hidden;
  padding: 20px;
  padding-top: calc(20px + env(safe-area-inset-top));
  padding-bottom: calc(20px + env(safe-area-inset-bottom));
}

.background-effects {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.star {
  position: absolute;
  width: 4px;
  height: 4px;
  background: #fff;
  border-radius: 50%;
  animation: twinkle 2s infinite;

  &.star-1 {
    top: 10%;
    left: 20%;
    animation-delay: 0s;
  }
  &.star-2 {
    top: 20%;
    right: 30%;
    animation-delay: 0.5s;
  }
  &.star-3 {
    top: 60%;
    left: 15%;
    animation-delay: 1s;
  }
  &.star-4 {
    bottom: 30%;
    right: 20%;
    animation-delay: 1.5s;
  }
  &.star-5 {
    top: 80%;
    left: 60%;
    animation-delay: 0.8s;
  }
}

@keyframes twinkle {
  0%, 100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}

.spotlight {
  position: absolute;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  opacity: 0.1;

  &.spotlight-1 {
    top: -100px;
    right: -100px;
    background: radial-gradient(circle, #6c5ce7 0%, transparent 70%);
  }

  &.spotlight-2 {
    bottom: -100px;
    left: -100px;
    background: radial-gradient(circle, #00bfff 0%, transparent 70%);
  }
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

.card-header {
  text-align: center;
  margin-bottom: 32px;
}

.logo-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 16px;
}

.title {
  color: #fff;
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 8px 0;
  background: linear-gradient(135deg, #ffd700, #ff6b6b, #a29bfe);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  margin: 0;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-space {
  width: 100%;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  font-weight: 500;
}

.loading-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.alert-message {
  margin-top: 8px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.recent-codes {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.recent-title {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  margin: 0 0 12px 0;
  text-align: center;
}

.code-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.code-item {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.8) !important;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.98);
  }
}

@media (max-width: 768px) {
  .login-card {
    padding: 32px 24px;
  }

  .title {
    font-size: 24px;
  }

  .logo-icon {
    font-size: 40px;
  }

  .spotlight {
    width: 300px;
    height: 300px;
  }
}

@media (max-width: 480px) {
  .login-page {
    padding: 15px;
  }

  .login-card {
    padding: 24px 20px;
    border-radius: 16px !important;
  }

  .title {
    font-size: 20px;
  }

  .subtitle {
    font-size: 12px;
  }

  .logo-icon {
    font-size: 32px;
    margin-bottom: 12px;
  }

  .code-item {
    font-size: 11px;
    padding: 5px 10px;
  }

  .spotlight {
    width: 200px;
    height: 200px;
  }

  .star {
    width: 3px;
    height: 3px;
  }
}

:deep(.t-input) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;

  .t-input__inner {
    color: #fff;
    &::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }
  }

  &:hover:not(.t-is-disabled) {
    border-color: rgba(255, 255, 255, 0.3);
  }

  &.t-is-focused {
    border-color: #a29bfe;
    box-shadow: 0 0 20px rgba(162, 155, 254, 0.3);
  }
}

:deep(.login-btn) {
  background: linear-gradient(135deg, #a29bfe, #6c5ce7) !important;
  border: none !important;
  color: #fff !important;

  &:hover:not(.t-is-disabled) {
    transform: translateY(-3px);
    box-shadow: 0 10px 30px rgba(108, 92, 231, 0.4);
  }
}

:deep(.t-alert--error) {
  background: rgba(255, 107, 107, 0.15);
  border-color: rgba(255, 107, 107, 0.3);
}

:deep(.t-alert--success) {
  background: rgba(46, 204, 113, 0.15);
  border-color: rgba(46, 204, 113, 0.3);
}
</style>
