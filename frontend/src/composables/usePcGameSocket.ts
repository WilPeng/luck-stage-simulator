import { ref, onUnmounted } from 'vue'
import { io, type Socket } from 'socket.io-client'
import type { PCSeason } from '../types/powerchallenge'

function getApiRoot(): string {
  const base = ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '') || ''
  return base.replace(/\/api$/, '')
}

function getToken(): string | null {
  const key = 'powerchallenge_token'
  return localStorage.getItem(key) || sessionStorage.getItem(key)
}

export function usePcGameSocket() {
  const socket = ref<Socket | null>(null)
  const connected = ref(false)
  const isAdmin = ref(false)
  const error = ref('')
  const state = ref<PCSeason | null>(null)
  const online = ref<{ playerId: string; playerName: string }[]>([])
  const countdown = ref(0)
  const roundStartData = ref<any>(null)
  const claimedEvent = ref<any>(null)
  const roundEnded = ref<any>(null)
  const seasonFinished = ref<any>(null)

  function connect() {
    if (socket.value) return
    const token = getToken()
    if (!token) { error.value = '未登录'; return }
    const s = io(`${getApiRoot()}/powerchallenge`, {
      auth: { token },
      transports: ['websocket', 'polling']
    })
    s.on('connect', () => {
      connected.value = true
      // 只要选手登录并打开任意本游戏页面即视为“在线”（服务端只统计 role=player）
      s.emit('pc_join_arena')
    })
    s.on('disconnect', () => { connected.value = false })
    s.on('connect_error', (err: any) => { error.value = err.message || '连接失败' })

    s.on('pc:state', (data: PCSeason) => { state.value = data })
    s.on('pc:presence', (data: { online: any[] }) => { online.value = data.online })
    s.on('pc:countdown', (data: { seconds: number }) => { countdown.value = data.seconds })
    s.on('pc:round_start', (data: any) => { countdown.value = 3; roundStartData.value = data })
    s.on('pc:round_started', (data: any) => {
      countdown.value = -1
      roundStartData.value = data
    })
    s.on('pc:claimed', (data: any) => { claimedEvent.value = data })
    s.on('pc:round_ended', (data: any) => { roundEnded.value = data })
    s.on('pc:season_finished', (data: any) => { seasonFinished.value = data })
    socket.value = s
  }

  function submitAnswer(questionId: string, answer: string) {
    return new Promise<any>((resolve, reject) => {
      if (!socket.value || !connected.value) return reject(new Error('未连接'))
      socket.value.emit('pc_answer', { questionId, answer }, (res: any) => {
        if (res && res.success === false) reject(new Error(res.error || '作答失败'))
        else resolve(res)
      })
    })
  }

  function adminStart() {
    return new Promise<any>((resolve, reject) => {
      if (!socket.value || !connected.value) return reject(new Error('未连接'))
      socket.value.emit('pc_admin_start', (res: any) => res?.success === false ? reject(new Error(res.error)) : resolve(res))
    })
  }
  function adminEnd() {
    return new Promise<any>((resolve, reject) => {
      if (!socket.value || !connected.value) return reject(new Error('未连接'))
      socket.value.emit('pc_admin_end', (res: any) => res?.success === false ? reject(new Error(res.error)) : resolve(res))
    })
  }
  function adminNext() {
    return new Promise<any>((resolve, reject) => {
      if (!socket.value || !connected.value) return reject(new Error('未连接'))
      socket.value.emit('pc_admin_next', (res: any) => res?.success === false ? reject(new Error(res.error)) : resolve(res))
    })
  }
  function adminReset() {
    return new Promise<any>((resolve, reject) => {
      if (!socket.value || !connected.value) return reject(new Error('未连接'))
      socket.value.emit('pc_admin_reset', (res: any) => res?.success === false ? reject(new Error(res.error)) : resolve(res))
    })
  }

  function joinArena() {
    if (socket.value && connected.value) socket.value.emit('pc_join_arena')
  }
  function leaveArena() {
    if (socket.value && connected.value) socket.value.emit('pc_leave_arena')
  }

  function disconnect() {
    if (socket.value) { socket.value.disconnect(); socket.value = null }
    connected.value = false
  }

  onUnmounted(disconnect)

  return {
    socket, connected, isAdmin, error, state, online, countdown,
    roundStartData, claimedEvent, roundEnded, seasonFinished,
    connect, joinArena, leaveArena, disconnect, submitAnswer,
    adminStart, adminEnd, adminNext, adminReset
  }
}
