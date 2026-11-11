/**
 * BB House 前端 API 服务
 */
import { doRequest, doDownload } from './bbApi'

// ===== 房屋地图 =====
export async function bbGetHouseMap() {
  return doRequest<any>('/house/map')
}

export async function bbGetHouseRooms() {
  return doRequest<any>('/house/rooms')
}

export async function bbGetRoomPlayers(roomId: string) {
  return doRequest<any>(`/house/rooms/${roomId}`)
}

export async function bbGetMyLocation() {
  return doRequest<any>('/house/my-location')
}

export async function bbGetReachableRooms() {
  return doRequest<any>('/house/reachable')
}

// ===== 玩家移动 =====
export async function bbMoveToRoom(targetRoomId: string) {
  return doRequest<any>('/house/move', {
    method: 'POST',
    body: JSON.stringify({ targetRoomId })
  })
}

// ===== HOH 邀请 =====
export async function bbInviteToHohRoom(targetPlayerId: string) {
  return doRequest<any>('/house/invite', {
    method: 'POST',
    body: JSON.stringify({ targetPlayerId })
  })
}

export async function bbAcceptHohInvite() {
  return doRequest<any>('/house/accept-invite', {
    method: 'POST'
  })
}

// ===== HOH Monitor =====
export async function bbGetHohMonitor() {
  return doRequest<any>('/house/hoh-monitor')
}

// 冠军产生后管理员公开的全部聊天记录
export async function bbGetAllChatLogs(): Promise<{ allChatsRevealed: boolean; messages: any[] }> {
  return doRequest<any>('/house/all-chats')
}

// ===== 管理员 API =====
export async function bbAdminSetDoor(doorId: string, isOpen: boolean) {
  return doRequest<any>('/house/admin/door', {
    method: 'POST',
    body: JSON.stringify({ doorId, isOpen })
  })
}

export async function bbAdminEvictBackyard() {
  return doRequest<any>('/house/admin/evict-backyard', {
    method: 'POST'
  })
}

export async function bbAdminGetLocations() {
  return doRequest<any>('/house/admin/locations')
}

export async function bbAdminMovePlayer(playerId: string, targetRoomId: string) {
  return doRequest<any>('/house/admin/move-player', {
    method: 'POST',
    body: JSON.stringify({ playerId, targetRoomId })
  })
}

export async function bbAdminInitLocations() {
  return doRequest<any>('/house/admin/init-locations', {
    method: 'POST'
  })
}

// 管理员广播（通知 / 邀请所有人到某房间）
export async function bbAdminBroadcast(data: { type: 'notice' | 'invite'; roomId?: string | null; message?: string }) {
  return doRequest<any>('/house/admin/broadcast', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

// 广播通知历史（选手端 / 管理员端）
export async function bbGetBroadcastHistory(limit = 50) {
  return doRequest<any[]>(`/house/broadcasts?limit=${encodeURIComponent(String(limit))}`)
}

// 管理员删除单条广播记录
export async function bbDeleteBroadcast(id: string) {
  return doRequest<any>(`/house/broadcasts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// 管理员清空全部广播记录
export async function bbClearBroadcasts() {
  return doRequest<any>('/house/broadcasts', { method: 'DELETE' })
}

// ===== 睡眠 / 洗澡 / 状态 =====
export async function bbGetMyState() {
  return doRequest<any>('/house/my-state')
}

export async function bbSleep() {
  return doRequest<any>('/house/sleep', { method: 'POST', body: JSON.stringify({}) })
}

export async function bbSleepWake() {
  return doRequest<any>('/house/sleep/wake', { method: 'POST', body: JSON.stringify({}) })
}

export async function bbSleepApprove(playerId: string) {
  return doRequest<any>('/house/sleep/approve', { method: 'POST', body: JSON.stringify({ playerId }) })
}

export async function bbShower() {
  return doRequest<any>('/house/shower', { method: 'POST', body: JSON.stringify({}) })
}

// 管理员：房间人数/床位、赛季时间
export async function bbAdminSetRoom(data: { roomId: string; capacity?: number | null; bedLimit?: number | null; canSleep?: boolean; moveDuration?: number }) {
  return doRequest<any>('/house/admin/room', { method: 'POST', body: JSON.stringify(data) })
}

export async function bbAdminBulkMoveDuration(moveDuration: number, roomIds?: string[]) {
  return doRequest<any>('/house/admin/room-move-duration', { method: 'POST', body: JSON.stringify({ moveDuration, roomIds }) })
}

export async function bbAdminSetSeason(data: {
  autoSleepHour?: number
  sleepDurationMinutes?: number
  sleepWindowStart?: string
  sleepWindowEnd?: string
  showerCooldownMinutes?: number
  hohSleepAllowed?: boolean
}) {
  return doRequest<any>('/house/admin/season', { method: 'POST', body: JSON.stringify(data) })
}

// 管理员：以管理员身份向指定房间发言（上帝视角）
export async function bbAdminSendMessage(roomId: string, content: string) {
  return doRequest<any>('/house/admin/send-message', {
    method: 'POST',
    body: JSON.stringify({ roomId, content })
  })
}

// 管理员：查看所有房间聊天记录（含每条消息被谁看到）
export async function bbAdminChatLogs(roomId?: string, before?: string) {
  const params = new URLSearchParams()
  if (roomId) params.set('roomId', roomId)
  if (before) params.set('before', before)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return doRequest<any>(`/house/admin/chat-logs${qs}`)
}

// 管理员：导出聊天记录为 .txt
export async function bbAdminExportChatLogs(filters: {
  start?: string
  end?: string
  roomId?: string
  senderId?: string
  receiverId?: string
  keyword?: string
} = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value))
  })
  const qs = params.toString() ? `?${params.toString()}` : ''
  return doDownload(`/house/admin/chat-logs/export${qs}`)
}

// 管理员：房客睡眠/洗澡记录
export async function bbAdminGuestStates() {
  return doRequest<any>('/house/admin/guest-states')
}

export async function bbAdminSetSleep(playerId: string, sleeping: boolean) {
  return doRequest<any>('/house/admin/set-sleep', { method: 'POST', body: JSON.stringify({ playerId, sleeping }) })
}

export async function bbAdminSetShower(playerId: string, showered: boolean) {
  return doRequest<any>('/house/admin/set-shower', { method: 'POST', body: JSON.stringify({ playerId, showered }) })
}

// 管理员：睡眠/洗澡 立即开始/结束/标记/清除
export async function bbAdminSleepAction(playerId: string, action: 'start' | 'end' | 'mark' | 'clear') {
  return doRequest<any>('/house/admin/sleep-action', { method: 'POST', body: JSON.stringify({ playerId, action }) })
}
export async function bbAdminShowerAction(playerId: string, action: 'start' | 'end' | 'mark' | 'clear') {
  return doRequest<any>('/house/admin/shower-action', { method: 'POST', body: JSON.stringify({ playerId, action }) })
}

// 餐厅照片墙
export async function bbGetPhotoWall(): Promise<{ players: any[]; order: string[] }> {
  return doRequest<any>('/house/photo-wall')
}

export async function bbAdminSetPhotoWallOrder(order: string[]) {
  return doRequest<any>('/house/admin/photo-wall-order', { method: 'POST', body: JSON.stringify({ order }) })
}
