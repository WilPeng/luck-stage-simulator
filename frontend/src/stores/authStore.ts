import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '../types/user'
import { login, logout as apiLogout } from '../services/api'

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<User | null>(null)
  const isLoggedIn = computed(() => !!currentUser.value)
  const isAdmin = computed(() => currentUser.value?.role === 'admin')
  const isPlayer = computed(() => ['player', 'captain'].includes(currentUser.value?.role || ''))
  const isCaptain = computed(() => currentUser.value?.role === 'captain')

  // 登录：兼容两种响应格式
  //   真实后端: { success, data: User, token } → doRequest 拆出 User
  //   Mock:     { token, user }
  async function loginUser(code: string): Promise<{ token?: string; user: User } | null> {
    const result = await login(code)
    if (!result) return null

    // 提取 token——可能以 result.token 或 result 根层存在
    const token = result.token || ''
    // 提取 user——mock 返回 { token, user }，真实后端直接返回 User
    const user: User = result.user || result

    if (token) {
      sessionStorage.setItem('luck_sim_token', token)
      localStorage.setItem('luck_sim_token', token)
    }
    if (user) {
      currentUser.value = user
      sessionStorage.setItem('luck_sim_user', JSON.stringify(user))
    }
    return { token, user }
  }

  async function logout(): Promise<void> {
    await apiLogout()
    currentUser.value = null
  }

  function restoreSession(): boolean {
    const userJson = sessionStorage.getItem('luck_sim_user')
    if (userJson) {
      try {
        currentUser.value = JSON.parse(userJson)
        return true
      } catch { /* ignore */ }
    }
    return false
  }

  function clearAuth(): void {
    currentUser.value = null
  }

  function setUser(user: User): void {
    currentUser.value = user
  }

  function updateUser(user: User): void {
    if (currentUser.value && currentUser.value.id === user.id) {
      currentUser.value = user
    }
  }

  function getDefaultRedirectPath(): string {
    if (isAdmin.value) return '/admin/dashboard'
    if (isPlayer.value) return '/player/home'
    return '/login'
  }

  return {
    currentUser, isLoggedIn, isAdmin, isPlayer, isCaptain,
    login: loginUser, logout, restoreSession, clearAuth, setUser,
    updateUser, getDefaultRedirectPath
  }
})
