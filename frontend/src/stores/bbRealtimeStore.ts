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

export const useBbRealtimeStore = defineStore('bbRealtime', () => {
  const tick = ref(0)
  const stageTick = ref(0)
  const connected = ref(false)
  const lastBroadcast = ref<{ type: string; roomId: string | null; roomName?: string; roomIcon?: string; message: string; from: string } | null>(null)
  const lastEvictionAnnounce = ref<{ round: number; segments: { type: string; text: string }[]; released: number } | null>(null)
  const lastVetoCard = ref<{ roundId: string; cardDraw: any } | null>(null)
  const lastEvictionNight = ref<any>(null)
  const lastMinigameSummon = ref<any>(null)

  let socket: Socket | null = null

  function bump() { tick.value++ }

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
    socket.on('bb:update', async (data: any) => {
      const season = useBbSeasonStore()
      try { await season.fetchProgress(); await season.fetchMenu() } catch {}
      bump()
      // 阶段/赛程相关操作 → 触发选手端页面重新加载
      const p = data?.path || ''
      // 投票等高频写操作不触发整页重载（否则选手端会不停刷新）
      const isVoteWrite = /\/eviction\/(vote|my-vote)\b/.test(p)
      if (!isVoteWrite && /\/(season|hoh|nomination|veto|eviction|endgame)/.test(p)) {
        stageTick.value++
      }
    })
    socket.on('bb:broadcast', (data: any) => {
      lastBroadcast.value = data
      bump()
    })
    socket.on('bb:eviction-announce', (data: any) => {
      lastEvictionAnnounce.value = data
      bump()
    })
    socket.on('bb:veto-card', (data: any) => {
      lastVetoCard.value = data
      bump()
    })
    socket.on('bb:eviction-night', (data: any) => {
      lastEvictionNight.value = data
      bump()
    })
    socket.on('bb:minigame-summon', (data: any) => {
      lastMinigameSummon.value = data
      bump()
    })
  }

  function clearBroadcast() { lastBroadcast.value = null }

  function disconnect() {
    if (socket) { socket.disconnect(); socket = null }
    connected.value = false
  }

  return { tick, stageTick, connected, lastBroadcast, lastEvictionAnnounce, lastVetoCard, lastEvictionNight, lastMinigameSummon, connect, disconnect, bump, clearBroadcast, vetoDeal, vetoDraw }
})
