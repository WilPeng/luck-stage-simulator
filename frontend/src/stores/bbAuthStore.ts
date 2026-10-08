import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BBHouseguest } from '../types/bigbrother'
import { bbLogin, bbAdminLogin, bbLogout } from '../services/bbApi'

export const useBbAuthStore = defineStore('bbAuth', () => {
  const currentUser = ref<BBHouseguest | null>(null)

  const isLoggedIn = computed(() => !!currentUser.value)
  const isAdmin = computed(() => currentUser.value?.role === 'admin')
  const isHouseguest = computed(() => currentUser.value?.role === 'houseguest')

  function gameKey(base: string): string {
    return `bigbrother_${base}`
  }

  function persist(token: string, user: BBHouseguest) {
    currentUser.value = user
    const tokenKey = gameKey('token')
    const userKey = gameKey('user')
    sessionStorage.setItem(tokenKey, token)
    sessionStorage.setItem(userKey, JSON.stringify(user))
    // 持久化，支持关闭浏览器后自动登录
    try {
      localStorage.setItem(tokenKey, token)
      localStorage.setItem(userKey, JSON.stringify(user))
    } catch {}
  }

  async function loginUser(username: string, password: string) {
    const result = await bbLogin(username, password)
    persist(result.token, result.user)
    return result
  }

  async function adminLogin(username: string, password: string) {
    const result = await bbAdminLogin(username, password)
    persist(result.token, result.user)
    return result
  }

  async function logout() {
    try {
      await bbLogout()
    } catch {}
    currentUser.value = null
    sessionStorage.removeItem(gameKey('token'))
    sessionStorage.removeItem(gameKey('user'))
    localStorage.removeItem(gameKey('token'))
    localStorage.removeItem(gameKey('user'))
  }

  function restoreSession(): boolean {
    const userKey = gameKey('user')
    const stored = sessionStorage.getItem(userKey) || localStorage.getItem(userKey)
    if (stored) {
      try {
        currentUser.value = JSON.parse(stored)
        return true
      } catch {}
    }
    return false
  }

  return {
    currentUser, isLoggedIn, isAdmin, isHouseguest,
    gameKey, loginUser, adminLogin, logout, restoreSession
  }
})
