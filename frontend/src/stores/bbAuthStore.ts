import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BBHouseguest } from '../types/bigbrother'
import { bbLogin, bbGetCurrentUser, bbLogout } from '../services/bbApi'

export const useBbAuthStore = defineStore('bbAuth', () => {
  const currentUser = ref<BBHouseguest | null>(null)

  const isLoggedIn = computed(() => !!currentUser.value)
  const isAdmin = computed(() => currentUser.value?.role === 'admin')
  const isHouseguest = computed(() => currentUser.value?.role === 'houseguest')

  function gameKey(base: string): string {
    return `bigbrother_${base}`
  }

  async function loginUser(code: string) {
    const result = await bbLogin(code)
    currentUser.value = result.user
    const tokenKey = gameKey('token')
    const userKey = gameKey('user')
    sessionStorage.setItem(tokenKey, result.token)
    localStorage.setItem(tokenKey, result.token)
    sessionStorage.setItem(userKey, JSON.stringify(result.user))
    // 保存登录历史
    try {
      const historyKey = gameKey('logged_players')
      const history = JSON.parse(localStorage.getItem(historyKey) || '[]')
      if (!history.find((h: any) => h.id === result.user.id)) {
        history.push({ id: result.user.id, name: result.user.name, role: result.user.role, loginCode: result.user.loginCode })
        localStorage.setItem(historyKey, JSON.stringify(history))
      }
    } catch {}
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
  }

  function restoreSession(): boolean {
    const userKey = gameKey('user')
    const stored = sessionStorage.getItem(userKey)
    if (stored) {
      try {
        currentUser.value = JSON.parse(stored)
        return true
      } catch {}
    }
    return false
  }

  function getLoggedPlayers(): { id: string; name: string; role: string; loginCode: string }[] {
    try {
      const historyKey = gameKey('logged_players')
      return JSON.parse(localStorage.getItem(historyKey) || '[]')
    } catch { return [] }
  }

  return {
    currentUser, isLoggedIn, isAdmin, isHouseguest,
    gameKey, loginUser, logout, restoreSession, getLoggedPlayers
  }
})
