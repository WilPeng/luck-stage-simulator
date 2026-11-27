import { defineStore } from 'pinia'
import { ref } from 'vue'
import { io, type Socket } from 'socket.io-client'
import { useBbSeasonStore } from './bbSeasonStore'

function getApiRoot(): string {
  const base = ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '') || ''
  return base.replace(/\/api$/, '')
}

function getToken(): string | null {
  const key = 'bigbrother_token'
  return localStorage.getItem(key) || sessionStorage.getItem(key)
}

// 只在赛程、赛制或菜单权限可能变化时同步导航数据。
const seasonUpdatePaths = [
  /^\/season\/(set|next|reset|round|twists|config|reveal-chats|endgame\/reset|endgame\/fhoh-pick)$/,
  /^\/(hoh\/undo|nomination\/(undo|replace\/undo)|veto\/undo-(competition|decision))$/,
  /^\/(round-twist|eviction\/(result|night\/start|restore\/[^/]+))$/,
  /^\/houseguests(?:\/[^/]+(?:\/walk(?:\/undo)?)?)?$/
]

export const useBbRealtimeStore = defineStore('bbRealtime', () => {
  const updatedPaths = ref<string[]>([])
  const connected = ref(false)
  const lastBroadcast = ref<{ type: string; roomId: string | null; roomName?: string; roomIcon?: string; message: string; from: string } | null>(null)
  const lastEvictionAnnounce = ref<{ round: number; segments: { type: string; text: string }[]; released: number } | null>(null)
  const lastVetoCard = ref<{ roundId: string; cardDraw: any } | null>(null)
  const lastEvictionNight = ref<any>(null)
  const lastMinigameSummon = ref<any>(null)
  const lastSummon = ref<{ path: string; at: number; by?: string } | null>(null)
  const lastKeyCeremony = ref<{ roundId: string; keyCeremony: any; nomineeIds: string[]; nomineeNames: string[] } | null>(null)

  let socket: Socket | null = null
  let updateTimer: ReturnType<typeof setTimeout> | null = null
  let flushingUpdates = false
  const pendingPaths = new Set<string>()

  function queueUpdate(path: string) {
    pendingPaths.add(path)
    scheduleUpdates()
  }

  function scheduleUpdates() {
    if (updateTimer || flushingUpdates || !pendingPaths.size) return
    updateTimer = setTimeout(flushUpdates, 80)
  }

  async function flushUpdates() {
    updateTimer = null
    const paths = Array.from(pendingPaths)
    pendingPaths.clear()
    const connection = socket
    flushingUpdates = true
    try {
      if (paths.some(path => seasonUpdatePaths.some(pattern => pattern.test(path)))) {
        const season = useBbSeasonStore()
        await season.fetchProgress()
        if (socket === connection) await season.fetchMenu()
      }
      if (socket === connection) updatedPaths.value = paths
    } finally {
      flushingUpdates = false
      scheduleUpdates()
    }
  }

  function emitWithAck(event: string, payload: any = {}): Promise<any> {
    return new Promise((resolve) => {
      if (!socket) return resolve({ success: false, error: '实时连接未建立' })
      let done = false
      const timer = setTimeout(() => { if (!done) { done = true; resolve({ success: false, error: '请求超时' }) } }, 8000)
      socket.emit(event, payload, (res: any) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve(res || { success: false })
      })
    })
  }

  function vetoDeal() { return emitWithAck('veto:card-deal', {}) }
  function vetoDraw() { return emitWithAck('veto:card-draw', {}) }

  function connect() {
    if (socket) return
    const token = getToken()
    if (!token) return
    socket = io(`${getApiRoot()}/bigbrother-game`, {
      auth: { token },
      transports: ['websocket', 'polling']
    })
    socket.on('connect', () => { connected.value = true })
    socket.on('disconnect', () => { connected.value = false })
    socket.on('bb:update', (data: { path?: string } | null) => {
      const prefix = '/api/bigbrother'
      if (!data?.path?.startsWith(prefix + '/')) return
      queueUpdate(data.path.slice(prefix.length).split('?')[0]!.replace(/\/+$/, ''))
    })
    socket.on('bb:broadcast', (data: any) => {
      lastBroadcast.value = data
    })
    socket.on('bb:eviction-announce', (data: any) => {
      lastEvictionAnnounce.value = data
    })
    socket.on('bb:veto-card', (data: any) => {
      lastVetoCard.value = data
      queueUpdate('/veto/card-draw')
    })
    socket.on('bb:eviction-night', (data: any) => {
      lastEvictionNight.value = data
    })
    socket.on('bb:minigame-summon', (data: any) => {
      lastMinigameSummon.value = data
    })
    socket.on('bb:key-ceremony', (data: any) => {
      lastKeyCeremony.value = data
    })
    socket.on('bb:summon', (data: any) => {
      lastSummon.value = data
    })
  }

  function clearBroadcast() { lastBroadcast.value = null }

  function disconnect() {
    if (socket) { socket.disconnect(); socket = null }
    if (updateTimer) clearTimeout(updateTimer)
    updateTimer = null
    pendingPaths.clear()
    connected.value = false
  }

  return { updatedPaths, connected, lastBroadcast, lastEvictionAnnounce, lastVetoCard, lastEvictionNight, lastMinigameSummon, lastKeyCeremony, lastSummon, connect, disconnect, clearBroadcast, vetoDeal, vetoDraw }
})
