import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PCPlayer } from '../types/powerchallenge'
import { pcLogin, pcGetCurrentUser, pcLogout } from '../services/pcApi'

export const usePcAuthStore = defineStore('pcAuth', () => {
  const currentUser = ref<PCPlayer | null>(null)
  const isLoggedIn = computed(() => !!currentUser.value)
  const isAdmin = computed(() => currentUser.value?.role === 'admin')
  const isPlayer = computed(() => currentUser.value?.role === 'player')

  function gameKey(base: string): string { return `powerchallenge_${base}` }

  async function loginUser(code: string) {
    const result = await pcLogin(code)
    currentUser.value = result.user
    const tokenKey = gameKey('token')
    const userKey = gameKey('user')
    sessionStorage.setItem(tokenKey, result.token)
    localStorage.setItem(tokenKey, result.token)
    sessionStorage.setItem(userKey, JSON.stringify(result.user))
    return result
  }

  async function logout() {
    await pcLogout()
    currentUser.value = null
    sessionStorage.removeItem(gameKey('token'))
    localStorage.removeItem(gameKey('token'))
    sessionStorage.removeItem(gameKey('user'))
  }

  function restoreSession(): boolean {
    const token = sessionStorage.getItem(gameKey('token'))
    const userJson = sessionStorage.getItem(gameKey('user'))
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson)
        currentUser.value = user
        return true
      } catch {}
    }
    return false
  }

  function getLoggedPlayers() {
    const key = gameKey('logged_players')
    return JSON.parse(localStorage.getItem(key) || '[]')
  }

  return { currentUser, isLoggedIn, isAdmin, isPlayer, loginUser, logout, restoreSession, gameKey, getLoggedPlayers }
})
