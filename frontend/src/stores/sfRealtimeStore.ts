import { defineStore } from 'pinia'
import { ref } from 'vue'
import { io, type Socket } from 'socket.io-client'

function getApiRoot(): string {
  const base = ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '') || ''
  // 相对路径（如 /api）时，socket 连当前站点根
  if (!/^https?:\/\//.test(base)) return ''
  return base.replace(/\/api$/, '')
}
function getGameId(): string {
  return sessionStorage.getItem('luck_sim_current_game') || 'shengfeng2026'
}
function getToken(): string | null {
  const gid = getGameId()
  return localStorage.getItem(`${gid}_token`) || sessionStorage.getItem(`${gid}_token`)
}

// 定向实时：仅用于「阶段切换 / 选歌 / 组队 / 公演结果」等场景。
// 采用 websocket-only 传输（避免长轮询开销），限制重连次数，配合各页面的
// useSfRefresh 路径匹配 + 去抖，只有相关页面在相关写入时才刷新。
export const useSfRealtimeStore = defineStore('sfRealtime', () => {
  const tick = ref(0)
  const stageTick = ref(0)
  const seasonTick = ref(0)
  const lastPath = ref('')
  const connected = ref(false)

  let socket: Socket | null = null

  function connect() {
    if (socket) return
    const token = getToken()
    if (!token) return
    socket = io(`${getApiRoot()}/game-realtime`, {
      auth: { token, gameId: getGameId() },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelayMax: 8000,
      timeout: 8000
    })
    socket.on('connect', () => { connected.value = true })
    socket.on('disconnect', () => { connected.value = false })
    socket.on('sf:update', (data: any) => {
      if (!data || (data.gameId && data.gameId !== getGameId())) return
      const p = data.path || ''
      lastPath.value = p
      tick.value++
      // 仅阶段/轮次相关写操作触发整页重挂载
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
