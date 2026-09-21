import { defineStore } from 'pinia'
import { ref } from 'vue'
import { io, type Socket } from 'socket.io-client'

function getApiRoot(): string {
  const base = ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '') || ''
  return base.replace(/\/api$/, '')
}
function getGameId(): string {
  return sessionStorage.getItem('luck_sim_current_game') || 'shengfeng2026'
}
function getToken(): string | null {
  const gid = getGameId()
  return localStorage.getItem(`${gid}_token`) || sessionStorage.getItem(`${gid}_token`)
}

export const useSfRealtimeStore = defineStore('sfRealtime', () => {
  const tick = ref(0)          // 任意写操作（用于页面级轻量刷新）
  const stageTick = ref(0)     // 阶段/轮次变化（触发 router-view 重新挂载）
  const seasonTick = ref(0)    // 赛季/轮次配置变化（触发菜单、进度重新拉取）
  const lastPath = ref('')
  const connected = ref(false)

  let socket: Socket | null = null

  function connect() {
    if (socket) return
    const token = getToken()
    if (!token) return
    socket = io(`${getApiRoot()}/game-realtime`, {
      auth: { token, gameId: getGameId() },
      transports: ['websocket', 'polling']
    })
    socket.on('connect', () => { connected.value = true })
    socket.on('disconnect', () => { connected.value = false })
    socket.on('sf:update', (data: any) => {
      if (!data || (data.gameId && data.gameId !== getGameId())) return
      const p = data.path || ''
      lastPath.value = p
      tick.value++
      // 仅阶段/轮次相关写操作触发整页重挂载，避免抽卡等操作整页刷新
      if (/\/season(\/|$|\?)/.test(p)) {
        stageTick.value++
        seasonTick.value++
      }
    })
  }

  function disconnect() {
    if (socket) { socket.disconnect(); socket = null }
    connected.value = false
  }

  return { tick, stageTick, seasonTick, lastPath, connected, connect, disconnect }
})
