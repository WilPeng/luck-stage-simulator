/**
 * 小游戏 Socket 连接 composable
 */
import { ref, onUnmounted, type Ref } from 'vue'
import { io, Socket } from 'socket.io-client'
import type { MinigameId, MinigameParticipant } from '../types/bigbrother'

function getApiRoot(): string {
  // socket.io namespace 在后端是根路径（/bigbrother-minigame），不带 /api
  const base = ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '') || ''
  return base.replace(/\/api$/, '')
}

function getToken(): string | null {
  const key = 'bigbrother_token'
  return localStorage.getItem(key) || sessionStorage.getItem(key)
}

export function useMinigameSocket(roomId: Ref<string | null>) {
  const socket = ref<Socket | null>(null)
  const connected = ref(false)
  const gameState = ref<any>(null)
  const countdown = ref(0)
  const participants = ref<MinigameParticipant[]>([])
  const winner = ref<{ playerId: string; playerName: string } | null>(null)
  const scores = ref<Record<string, number>>({})
  const error = ref('')
  const finished = ref(false)
  const progress = ref<any>(null)
  const events = ref<any[]>([])
  const paused = ref(false)
  const allReady = ref(false)
  const summoned = ref(false)

  function connect() {
    if (socket.value) return

    const token = getToken()
    if (!token) {
      error.value = '未登录'
      return
    }

    const s = io(`${getApiRoot()}/bigbrother-minigame`, {
      auth: { token },
      transports: ['websocket', 'polling']
    })

    s.on('connect', () => {
      connected.value = true
      if (roomId.value) {
        s.emit('join_room', { roomId: roomId.value })
      }
    })

    s.on('disconnect', () => {
      connected.value = false
    })

    s.on('game_error', (data: any) => {
      error.value = data.message || '游戏错误'
    })

    s.on('game_countdown', (data: { seconds: number }) => {
      countdown.value = data.seconds
    })

    s.on('game_started', (data: { startTime: number }) => {
      countdown.value = -1
      finished.value = false
      if (!gameState.value) {
        gameState.value = { startTime: data.startTime, status: 'playing' }
      }
    })

    s.on('game_paused', (data: any) => {
      paused.value = true
      if (gameState.value) gameState.value.status = 'paused'
    })

    s.on('game_resumed', (data: any) => {
      paused.value = false
      if (gameState.value) gameState.value.status = 'playing'
    })

    s.on('game_stopped', (data: any) => {
      finished.value = true
      winner.value = data.winner || null
    })

    s.on('game_state', (data: any) => {
      gameState.value = data
    })

    // 管理员观战：实时进度 + 事件流
    s.on('game_progress', (data: any) => {
      progress.value = data
      if (data && Array.isArray(data.participants)) participants.value = data.participants
    })

    s.on('game_event', (data: any) => {
      if (!data) return
      events.value = [...events.value, data]
    })

    s.on('game_finished', (data: { winner: { playerId: string; playerName: string } | null; scores: Record<string, number> }) => {
      finished.value = true
      winner.value = data.winner
      scores.value = data.scores || {}
    })

    s.on('participant_joined', (data: { playerId: string; playerName: string; participants: any[] }) => {
      participants.value = data.participants
    })

    s.on('participant_left', (data: { playerId: string; playerName: string }) => {
      const p = participants.value.find(x => x.playerId === data.playerId)
      if (p) p.connected = false
    })

    // 准备环节
    s.on('ready_update', (data: any) => {
      if (data && Array.isArray(data.participants)) participants.value = data.participants
      allReady.value = !!(data && data.allReady)
    })

    // 管理员召集
    s.on('game_summoned', () => {
      summoned.value = true
    })

    s.on('connect_error', (err: any) => {
      error.value = err.message || '连接失败'
    })

    socket.value = s
  }

  function joinRoom(rid: string) {
    roomId.value = rid
    if (socket.value && connected.value) {
      socket.value.emit('join_room', { roomId: rid })
    }
  }

  function sendAction(action: any) {
    if (socket.value && connected.value && roomId.value) {
      socket.value.emit('game_action', { roomId: roomId.value, action })
    }
  }

  function setReady(ready: boolean) {
    if (socket.value && connected.value && roomId.value) {
      socket.value.emit('player_ready', { roomId: roomId.value, ready })
    }
  }

  function disconnect() {
    if (socket.value) {
      socket.value.disconnect()
      socket.value = null
    }
    connected.value = false
    gameState.value = null
    winner.value = null
    finished.value = false
    progress.value = null
    events.value = []
    paused.value = false
    allReady.value = false
    summoned.value = false
  }

  onUnmounted(() => {
    disconnect()
  })

  return {
    socket, connected, gameState, countdown, participants,
    winner, scores, error, finished, progress, events, paused, allReady, summoned,
    connect, joinRoom, sendAction, setReady, disconnect
  }
}
