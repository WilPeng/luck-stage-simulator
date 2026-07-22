import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '../types/user'
import { login, logout as apiLogout } from '../services/api'
import { DEFAULT_GAME_ID } from '../config/games'

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<User | null>(null)
  const currentGameId = ref<string>(
    sessionStorage.getItem('luck_sim_current_game') || DEFAULT_GAME_ID
  )
  const isLoggedIn = computed(() => !!currentUser.value)
  const isAdmin = computed(() => currentUser.value?.role === 'admin')
  const isPlayer = computed(() => ['player', 'captain'].includes(currentUser.value?.role || ''))
  const isCaptain = computed(() => currentUser.value?.role === 'captain')

  function setCurrentGameId(gameId: string) {
    currentGameId.value = gameId
    sessionStorage.setItem('luck_sim_current_game', gameId)
  }

  function gameKey(base: string): string {
    return `${currentGameId.value}_${base}`
  }

  // ---- 主题切换（深色/浅色模式） ----
  const THEME_KEY = 'luck_sim_theme'
  const theme = ref<'dark' | 'light'>(
    (localStorage.getItem(THEME_KEY) as 'dark' | 'light') || 'light'
  )

  function applyTheme(t: 'dark' | 'light') {
    theme.value = t
    localStorage.setItem(THEME_KEY, t)
    document.querySelectorAll('.admin-layout, .player-layout').forEach(el => {
      el.setAttribute('data-theme', t)
    })
  }

  function toggleTheme() {
    applyTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  function initTheme() {
    applyTheme(theme.value)
  }

  async function loginUser(code: string): Promise<{ token?: string; user: User } | null> {
    const result = await login(code)
    if (!result) return null

    const token = result.token || ''
    const user: User = result.user || result

    if (token) {
      sessionStorage.setItem(gameKey('token'), token)
      localStorage.setItem(gameKey('token'), token)
    }
    if (user) {
      currentUser.value = user
      sessionStorage.setItem(gameKey('user'), JSON.stringify(user))
      saveLoggedPlayer(user)
    }
    return { token, user }
  }

  async function logout(): Promise<void> {
    await apiLogout()
    currentUser.value = null
    sessionStorage.removeItem(gameKey('token'))
    sessionStorage.removeItem(gameKey('user'))
  }

  function restoreSession(): boolean {
    const userJson = sessionStorage.getItem(gameKey('user'))
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

  function saveLoggedPlayer(user: User) {
    const key = gameKey('logged_players')
    const stored = localStorage.getItem(key)
    const list: User[] = stored ? JSON.parse(stored) : []
    const idx = list.findIndex(u => u.loginCode === user.loginCode)
    if (idx >= 0) {
      list[idx] = user
    } else {
      list.push(user)
    }
    localStorage.setItem(key, JSON.stringify(list))
  }

  function getLoggedPlayers(): User[] {
    const key = gameKey('logged_players')
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : []
  }

  async function switchToPlayer(player: User): Promise<void> {
    const result = await loginUser(player.loginCode)
    if (!result) {
      throw new Error('切换账号失败，无法获取认证信息')
    }
  }

  function updateUser(user: User): void {
    if (currentUser.value && currentUser.value.id === user.id) {
      currentUser.value = user
    }
  }

  function getDefaultRedirectPath(): string {
    const prefix = `/games/${currentGameId.value}`
    if (isAdmin.value) return `${prefix}/admin/dashboard`
    if (isPlayer.value) return `${prefix}/player/home`
    return `${prefix}/login`
  }

  return {
    currentUser, currentGameId, isLoggedIn, isAdmin, isPlayer, isCaptain,
    setCurrentGameId, gameKey,
    login: loginUser, loginUser, logout, restoreSession, clearAuth, setUser,
    updateUser, getDefaultRedirectPath, switchToPlayer, getLoggedPlayers,
    theme, toggleTheme, initTheme
  }
})
