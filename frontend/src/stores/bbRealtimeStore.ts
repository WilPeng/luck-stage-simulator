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
  const lastKeyCeremony = ref<{ roundId: string; keyCeremony: any; nomineeIds: string[]; nomineeNames: string[] } | null>(null)

  let socket: Socket | null = null
  let bumpTimer: ReturnType<typeof setTimeout> | null = null

  // 合并短时间内的大量更新为一次，避免同一批写操作触发多次重复请求
  function bump() {
    if (bumpTimer) return
    bumpTimer = setTimeout(() => { bumpTimer = null; tick.value++ }, 80)
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
    socket.on('bb:update', async (data: any) => {
      const p = data?.path || ''
      // 投票等高频写操作不触发整页重载（否则选手端会不停刷新）
      const isVoteWrite = /\/eviction\/(vote|my-vote)\b/.test(p)
      // 逐句揭晓类写入（淘汰夜 / 宣布 / 冠军揭晓）：仅更新展示内容，选手端靠广播事件增量展示，
      // 绝不能整页重载，否则每次「下一句」都会刷新整个页面
      const isRevealWrite = /\/(night|announce)\/(start|next|confirm|reset|prepare)\b/.test(p)
        || /\/champion-reveal\b/.test(p)
      // 高频写操作（投票 / 逐句揭晓 / 小游戏 / House / 聊天 / 提名仪式）：不重新拉取赛季进度与菜单，
      // 避免“每次有人投票，所有客户端都各发 2 个请求”的请求风暴导致卡顿
      const isKeyWrite = /\/nomination\/key-/.test(p)
      const isHighFreq = isVoteWrite || isRevealWrite || isKeyWrite
        || /\/(minigame|house|chat)\b/.test(p) || /\/jury-qa\b/.test(p)

      if (!isHighFreq) {
        const season = useBbSeasonStore()
        try { await season.fetchProgress(); await season.fetchMenu() } catch {}
      }
      bump()

      // 提名仪式逐句环节：不整页重载，靠 bb:key-ceremony 广播增量更新
      if (!isVoteWrite && !isRevealWrite && !isKeyWrite && /\/(season|hoh|nomination|veto|eviction|endgame)/.test(p)) {
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
    socket.on('bb:key-ceremony', (data: any) => {
      lastKeyCeremony.value = data
      bump()
    })
  }

  function clearBroadcast() { lastBroadcast.value = null }

  function disconnect() {
    if (socket) { socket.disconnect(); socket = null }
    connected.value = false
  }

  return { tick, stageTick, connected, lastBroadcast, lastEvictionAnnounce, lastVetoCard, lastEvictionNight, lastMinigameSummon, lastKeyCeremony, connect, disconnect, bump, clearBroadcast, vetoDeal, vetoDraw }
})
