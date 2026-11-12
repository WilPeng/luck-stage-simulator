import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BBHouseguest } from '../types/bigbrother'
import { bbLogin, bbAdminLogin, bbLogout, bbGetCurrentUser } from '../services/bbApi'

export const useBbAuthStore = defineStore('bbAuth', () => {
  const currentUser = ref<BBHouseguest | null>(null)

  const isLoggedIn = computed(() => !!currentUser.value)
  const isAdmin = computed(() => currentUser.value?.role === 'admin')
  const isHouseguest = computed(() => currentUser.value?.role === 'houseguest')
  const playerStatus = computed(() => currentUser.value?.status || '')
  const isEvictedPlayer = computed(() => ['evicted', 'walked'].includes(playerStatus.value))
  const isJuryPlayer = computed(() => playerStatus.value === 'jury')
  // 已淘汰/退赛/陪审团：只能进入 BB House（陪审团在冠军投票阶段可进终局投票）
  const isRestrictedPlayer = computed(() => isEvictedPlayer.value || isJuryPlayer.value)

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

  // 从后端刷新当前用户（用于及时获取淘汰/陪审团状态变化），默认 15 秒内不重复请求
  let lastRefreshAt = 0
  async function refreshCurrentUser(force = false) {
    if (!currentUser.value) return null
    const now = Date.now()
    if (!force && now - lastRefreshAt < 15000) return currentUser.value
    lastRefreshAt = now
    try {
      const user = await bbGetCurrentUser()
      currentUser.value = user
      const userKey = gameKey('user')
      sessionStorage.setItem(userKey, JSON.stringify(user))
      try { localStorage.setItem(userKey, JSON.stringify(user)) } catch {}
      return user
    } catch {
      return currentUser.value
    }
  }

  return {
    currentUser, isLoggedIn, isAdmin, isHouseguest,
    playerStatus, isEvictedPlayer, isJuryPlayer, isRestrictedPlayer,
    gameKey, loginUser, adminLogin, logout, restoreSession, refreshCurrentUser
  }
})
