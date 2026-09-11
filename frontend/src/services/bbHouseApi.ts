/**
 * BB House 前端 API 服务
 */
import { doRequest } from './bbApi'

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
export async function bbAdminSetRoom(data: { roomId: string; capacity?: number | null; bedLimit?: number | null; canSleep?: boolean }) {
  return doRequest<any>('/house/admin/room', { method: 'POST', body: JSON.stringify(data) })
}

export async function bbAdminSetSeason(data: { autoSleepHour?: number; hohSleepAllowed?: boolean }) {
  return doRequest<any>('/house/admin/season', { method: 'POST', body: JSON.stringify(data) })
}
