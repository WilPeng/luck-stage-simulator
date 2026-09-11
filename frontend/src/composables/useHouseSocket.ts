/**
 * BB House Socket.IO Composable
 * 管理 /bigbrother-house 命名空间的连接和事件
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { io, Socket } from 'socket.io-client'

function getApiRoot(): string {
  // socket.io namespace 在后端是根路径（/bigbrother-house），不带 /api
  const base = ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '') || ''
  return base.replace(/\/api$/, '')
}

function getToken(): string | null {
  const key = 'bigbrother_token'
  return localStorage.getItem(key) || sessionStorage.getItem(key)
}

export interface HouseMessage {
  id: string
  senderId: string
  senderName: string
  senderRole: string
  senderAvatar: string | null
  content: string
  chatType: string
  roomId: string
  gameId: string
  createdAt: string
}

export interface HousePlayer {
  playerId: string
  playerName: string
  avatar?: string | null
  enteredAt?: string
}

export interface HohMonitorRoom {
  roomId: string
  roomName: string
  icon: string
  count: number
}

export function useHouseSocket() {
  const socket = ref<Socket | null>(null)
  const connected = ref(false)
  const currentRoomId = ref('living_room')

  // 事件回调
  const onHistory = ref<((data: { roomId: string; messages: HouseMessage[] }) => void) | null>(null)
  const onNewMessage = ref<((data: { roomId: string; message: HouseMessage }) => void) | null>(null)
  const onOlderMessages = ref<((data: { roomId: string; messages: HouseMessage[] }) => void) | null>(null)
  const onPlayerJoined = ref<((data: { roomId: string; playerName: string }) => void) | null>(null)
  const onPlayerLeft = ref<((data: { roomId: string; playerName: string }) => void) | null>(null)
  const onRoomPresence = ref<((data: { roomId: string; players: HousePlayer[] }) => void) | null>(null)
  const onDoorUpdate = ref<((data: { doorId: string; isOpen: boolean }) => void) | null>(null)
  const onInviteReceived = ref<((data: { hohName: string; hohId: string; roomId: string }) => void) | null>(null)
  const onInviteAccepted = ref<((data: { playerId: string; playerName: string }) => void) | null>(null)
  const onInviteDeclined = ref<((data: { playerId: string; playerName: string }) => void) | null>(null)
  const onInviteCancelled = ref<((data: { playerId?: string; hohId?: string }) => void) | null>(null)
  const onBroadcast = ref<((data: { type: string; roomId: string | null; message: string; from: string; at: string }) => void) | null>(null)
  const onSleepForced = ref<((data: { wakeAt: string }) => void) | null>(null)
  const onForceMoved = ref<((data: { targetRoomId: string; reason: string }) => void) | null>(null)
  const onMonitorUpdate = ref<((data: HohMonitorRoom[]) => void) | null>(null)
  const onHohDoorbell = ref<((data: { playerId: string; playerName: string }) => void) | null>(null)
  const onHohDoorbellSent = ref<((data: any) => void) | null>(null)
  const onError = ref<((data: { error: string }) => void) | null>(null)

  function connect() {
    const token = getToken()
    if (!token) {
      console.error('[BBHouse Socket] 未登录，无法连接')
      return
    }

    const s = io(`${getApiRoot()}/bigbrother-house`, {
      auth: { token },
      transports: ['websocket', 'polling']
    })

    s.on('connect', () => {
      connected.value = true
      console.log('[BBHouse Socket] Connected')
    })

    s.on('disconnect', () => {
      connected.value = false
      console.log('[BBHouse Socket] Disconnected')
    })

    s.on('house:history', (data) => onHistory.value?.(data))
    s.on('house:new-message', (data) => onNewMessage.value?.(data))
    s.on('house:older-messages', (data) => onOlderMessages.value?.(data))
    s.on('house:player-joined', (data) => onPlayerJoined.value?.(data))
    s.on('house:player-left', (data) => onPlayerLeft.value?.(data))
    s.on('house:room-presence', (data) => onRoomPresence.value?.(data))
    s.on('house:door-update', (data) => onDoorUpdate.value?.(data))
    s.on('house:invite-received', (data) => onInviteReceived.value?.(data))
    s.on('house:invite-accepted', (data) => onInviteAccepted.value?.(data))
    s.on('house:invite-declined', (data) => onInviteDeclined.value?.(data))
    s.on('house:invite-cancelled', (data) => onInviteCancelled.value?.(data))
    s.on('house:broadcast', (data) => onBroadcast.value?.(data))
    s.on('house:sleep-forced', (data) => onSleepForced.value?.(data))
    s.on('house:force-moved', (data) => onForceMoved.value?.(data))
    s.on('house:monitor-update', (data) => onMonitorUpdate.value?.(data))
    s.on('house:hoh-doorbell', (data) => onHohDoorbell.value?.(data))
    s.on('house:hoh-doorbell-sent', (data) => onHohDoorbellSent.value?.(data))
    s.on('house:error', (data) => onError.value?.(data))

    socket.value = s
  }

  function disconnect() {
    socket.value?.disconnect()
    socket.value = null
    connected.value = false
  }

  function sendMessage(roomId: string, content: string) {
    socket.value?.emit('house:send-message', { roomId, content })
  }

  function loadMore(roomId: string, before: string) {
    socket.value?.emit('house:load-more', { roomId, before })
  }

  function notifyMoved(oldRoomId: string, newRoomId: string) {
    socket.value?.emit('house:moved', { oldRoomId, newRoomId })
    currentRoomId.value = newRoomId
  }

  function invitePlayer(targetPlayerId: string) {
    socket.value?.emit('house:invite-player', { targetPlayerId })
  }

  function acceptInvite() {
    socket.value?.emit('house:accept-invite')
  }

  function declineInvite(hohId: string) {
    socket.value?.emit('house:decline-invite', { hohId })
  }

  function cancelInvite(targetPlayerId: string) {
    socket.value?.emit('house:cancel-invite', { targetPlayerId })
  }

  function setHohDoor(isOpen: boolean) {
    socket.value?.emit('house:hoh-door-set', { isOpen })
  }

  function ringHohDoorbell() {
    socket.value?.emit('house:hoh-doorbell')
  }

  onMounted(connect)
  onUnmounted(disconnect)

  return {
    socket,
    connected,
    currentRoomId,
    connect,
    disconnect,
    sendMessage,
    loadMore,
    notifyMoved,
    invitePlayer,
    acceptInvite,
    declineInvite,
    cancelInvite,
    setHohDoor,
    ringHohDoorbell,
    onHistory,
    onNewMessage,
    onOlderMessages,
    onPlayerJoined,
    onPlayerLeft,
    onRoomPresence,
    onDoorUpdate,
    onInviteReceived,
    onInviteAccepted,
    onInviteDeclined,
    onInviteCancelled,
    onBroadcast,
    onSleepForced,
    onForceMoved,
    onMonitorUpdate,
    onHohDoorbell,
    onHohDoorbellSent,
    onError
  }
}
