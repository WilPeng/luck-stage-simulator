import type {
  BBSeason, BBSeasonProgress, BBMenuData, BBHouseguest,
  BBHouseguestListResponse, BBHouseguestStats, BBHohRecord,
  BBNomination, BBVetoRecord, BBEvictionVote, BBEviction,
  BBChatMessage, BBVoteResult, BBStageType,
  BBTwistRoundConfig, BBTwistDef, BBRoundConfig,
  MinigameDef, MinigameRoom
} from '../types/bigbrother'

function getApiRoot(): string {
  return ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '') || '/api'
}

const API_BASE = `${getApiRoot()}/bigbrother`

function getToken(): string | null {
  const key = 'bigbrother_token'
  return localStorage.getItem(key) || sessionStorage.getItem(key)
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

async function doRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    ...options,
    headers: { ...buildHeaders(), ...(options.headers || {}) }
  })
  const text = await res.text()
  let json: any = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`服务器返回了无效响应 (HTTP ${res.status})`)
  }
  if (!res.ok || json.success === false) {
    const errMsg = json?.error || json?.message || `HTTP ${res.status}`
    const err = new Error(errMsg)
    ;(err as any).status = res.status
    ;(err as any).code = json?.code
    throw err
  }
  return json.data !== undefined ? json.data : json
}

// ===== 认证 =====
export async function bbLogin(loginCode: string): Promise<{ token: string; user: BBHouseguest }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: loginCode })
  })
  const text = await res.text()
  let json: any = {}
  try { json = text ? JSON.parse(text) : {} } catch { throw new Error('服务器返回了无效响应') }
  if (res.ok && json.success !== false) {
    return { token: json.token, user: json.data }
  }
  throw new Error(json.error || '登录失败')
}

export async function bbGetCurrentUser(): Promise<BBHouseguest> {
  return doRequest<BBHouseguest>('/auth/me')
}

export async function bbLogout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: buildHeaders()
    })
  } catch {}
}

// ===== 赛季 =====
export async function bbGetSeason(): Promise<BBSeason> {
  return doRequest<BBSeason>('/season')
}

export async function bbGetSeasonProgress(): Promise<BBSeasonProgress> {
  return doRequest<BBSeasonProgress>('/season/progress')
}

export async function bbGetMenu(): Promise<BBMenuData> {
  return doRequest<BBMenuData>('/season/menu')
}

export async function bbSetStage(round: number, stage: BBStageType): Promise<BBSeason> {
  return doRequest<BBSeason>('/season/set', {
    method: 'POST',
    body: JSON.stringify({ round, stage })
  })
}

export async function bbNextStage(): Promise<BBSeason> {
  return doRequest<BBSeason>('/season/next', { method: 'POST' })
}

export async function bbResetSeason(): Promise<any> {
  return doRequest<any>('/season/reset', { method: 'POST' })
}

export async function bbUpdateRound(params: { totalRounds?: number; insertAfter?: number; deleteRound?: number }): Promise<BBSeason> {
  return doRequest<BBSeason>('/season/round', {
    method: 'PUT',
    body: JSON.stringify(params)
  })
}

// ===== Twist 配置 =====
export async function bbGetTwistConfigs(): Promise<{ twistConfigs: BBTwistRoundConfig[]; allTwists: BBTwistDef[] }> {
  return doRequest('/season/twists')
}

export async function bbSaveTwistConfigs(twistConfigs: BBTwistRoundConfig[]): Promise<BBSeason> {
  return doRequest<BBSeason>('/season/twists', {
    method: 'PUT',
    body: JSON.stringify({ twistConfigs })
  })
}

// ===== 赛季配置（新接口） =====
export async function bbGetSeasonConfig(): Promise<{
  roundConfigs: BBRoundConfig[]
  allTwists: BBTwistDef[]
  totalRounds: number
  isSeasonStarted: boolean
  currentRound: number
  jurySize: number
}> {
  return doRequest('/season/config')
}

export async function bbSaveSeasonConfig(params: { roundConfigs: BBRoundConfig[]; totalRounds?: number; jurySize?: number; finalSize?: number }): Promise<BBSeason> {
  return doRequest<BBSeason>('/season/config', {
    method: 'PUT',
    body: JSON.stringify(params)
  })
}

// ===== 直接民主投票 =====
export async function bbVoteNominees(votes: { voterId: string; voterName: string; targetId: string; targetName: string }[]): Promise<any> {
  return doRequest('/nomination/vote-nominees', {
    method: 'POST',
    body: JSON.stringify({ votes })
  })
}

// ===== 房客管理 =====
export async function bbGetHouseguests(params?: { keyword?: string; status?: string; page?: number; pageSize?: number }): Promise<BBHouseguestListResponse> {
  const query = new URLSearchParams()
  if (params?.keyword) query.append('keyword', params.keyword)
  if (params?.status) query.append('status', params.status)
  if (params?.page) query.append('page', String(params.page))
  if (params?.pageSize) query.append('pageSize', String(params.pageSize))
  const qs = query.toString()
  return doRequest<BBHouseguestListResponse>(`/houseguests${qs ? '?' + qs : ''}`)
}

export async function bbGetHouseguestStats(): Promise<BBHouseguestStats> {
  return doRequest<BBHouseguestStats>('/houseguests/stats')
}

export async function bbGetActiveHouseguests(): Promise<{ id: string; name: string; avatar: string | null; status: string }[]> {
  return doRequest('/houseguests/active')
}

export async function bbCreateHouseguest(data: { name: string; loginCode: string }): Promise<BBHouseguest> {
  return doRequest<BBHouseguest>('/houseguests', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function bbUpdateHouseguest(id: string, data: { name?: string; status?: string }): Promise<BBHouseguest> {
  return doRequest<BBHouseguest>(`/houseguests/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  })
}

export async function bbDeleteHouseguest(id: string): Promise<void> {
  return doRequest<void>(`/houseguests/${id}`, { method: 'DELETE' })
}

// ===== 头像 =====

/** 将存储路径转为可访问的完整 URL */
export function bbGetAvatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null
  if (avatar.startsWith('http')) return avatar
  // 云端（Render）时拼接完整地址，本地开发时直接使用相对路径走 Vite proxy
  const base = API_BASE.startsWith('http') ? API_BASE.replace('/api/bigbrother', '') : ''
  return `${base}${avatar}`
}

/** 选手自行上传头像 */
export async function bbUploadMyAvatar(file: File, houseguestId?: string): Promise<{ avatar: string; houseguestId: string }> {
  const formData = new FormData()
  formData.append('avatar', file)
  if (houseguestId) formData.append('houseguestId', houseguestId)
  const url = `${API_BASE}/houseguests/me/avatar`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: buildHeaders().Authorization || '' },
    body: formData
  })
  const json = await res.json()
  if (!res.ok || json.success === false) throw new Error(json.error || '上传失败')
  return json.data
}

/** 选手自行删除头像 */
export async function bbDeleteMyAvatar(houseguestId?: string): Promise<void> {
  const url = `${API_BASE}/houseguests/me/avatar`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
    body: houseguestId ? JSON.stringify({ houseguestId }) : undefined
  })
  const json = await res.json()
  if (!res.ok || json.success === false) throw new Error(json.error || '删除失败')
}

/** 管理员上传指定房客头像 */
export async function bbUploadHouseguestAvatar(id: string, file: File): Promise<{ avatar: string; houseguestId: string }> {
  const formData = new FormData()
  formData.append('avatar', file)
  const url = `${API_BASE}/houseguests/${id}/avatar`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: buildHeaders().Authorization || '' },
    body: formData
  })
  const json = await res.json()
  if (!res.ok || json.success === false) throw new Error(json.error || '上传失败')
  return json.data
}

/** 管理员删除指定房客头像 */
export async function bbDeleteHouseguestAvatar(id: string): Promise<void> {
  const url = `${API_BASE}/houseguests/${id}/avatar`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: buildHeaders()
  })
  const json = await res.json()
  if (!res.ok || json.success === false) throw new Error(json.error || '删除失败')
}

// ===== HOH =====
export async function bbGetCurrentHoh(): Promise<BBHohRecord | null> {
  return doRequest<BBHohRecord | null>('/hoh/current')
}

export async function bbGetHohHistory(): Promise<BBHohRecord[]> {
  return doRequest<BBHohRecord[]>('/hoh/history')
}

export async function bbAssignHoh(playerId: string, playerName: string): Promise<BBHohRecord> {
  return doRequest<BBHohRecord>('/hoh/assign', {
    method: 'POST',
    body: JSON.stringify({ playerId, playerName })
  })
}

export async function bbRunHohCompetition(minigameResult?: {
  winnerId: string; winnerName: string; minigameId: string; scores?: Record<string, number>
}): Promise<BBHohRecord> {
  return doRequest<BBHohRecord>('/hoh/competition', {
    method: 'POST',
    body: JSON.stringify(minigameResult ? { minigameResult } : {})
  })
}

// ===== 提名 =====
export async function bbGetCurrentNomination(): Promise<BBNomination | null> {
  return doRequest<BBNomination | null>('/nomination/current')
}

export async function bbSetNomination(nomineeIds: string[], nomineeNames: string[]): Promise<BBNomination> {
  return doRequest<BBNomination>('/nomination/set', {
    method: 'POST',
    body: JSON.stringify({ nomineeIds, nomineeNames })
  })
}

export async function bbReplaceNomination(playerId: string, playerName: string): Promise<BBNomination> {
  return doRequest<BBNomination>('/nomination/replace', {
    method: 'POST',
    body: JSON.stringify({ playerId, playerName })
  })
}

export async function bbGetNominationHistory(): Promise<BBNomination[]> {
  return doRequest<BBNomination[]>('/nomination/history')
}

// ===== 否决权 =====
export async function bbGetCurrentVeto(): Promise<BBVetoRecord | null> {
  return doRequest<BBVetoRecord | null>('/veto/current')
}

export async function bbDrawVetoParticipants(): Promise<BBVetoRecord> {
  return doRequest<BBVetoRecord>('/veto/draw', { method: 'POST' })
}

export async function bbPickVetoParticipant(pickedByPlayerId: string, pickedPlayerId: string): Promise<BBVetoRecord> {
  return doRequest<BBVetoRecord>('/veto/pick', {
    method: 'POST',
    body: JSON.stringify({ pickedByPlayerId, pickedPlayerId })
  })
}

export async function bbRunVetoCompetition(minigameResult?: {
  winnerId: string; winnerName: string; minigameId: string; scores?: Record<string, number>
}): Promise<BBVetoRecord> {
  return doRequest<BBVetoRecord>('/veto/competition', {
    method: 'POST',
    body: JSON.stringify(minigameResult ? { minigameResult } : {})
  })
}

export async function bbUseVeto(targetPlayerId: string, targetPlayerName: string): Promise<BBVetoRecord> {
  return doRequest<BBVetoRecord>('/veto/use', {
    method: 'POST',
    body: JSON.stringify({ targetPlayerId, targetPlayerName })
  })
}

export async function bbSkipVeto(): Promise<BBVetoRecord | null> {
  return doRequest<BBVetoRecord | null>('/veto/skip', { method: 'POST' })
}

export async function bbGetVetoHistory(): Promise<BBVetoRecord[]> {
  return doRequest<BBVetoRecord[]>('/veto/history')
}

// ===== 淘汰投票 =====
export async function bbGetVotes(): Promise<BBVoteResult> {
  return doRequest<BBVoteResult>('/eviction/votes')
}

export async function bbCastVote(targetId: string, targetName: string, voterId?: string, voterName?: string): Promise<BBEvictionVote> {
  const body: any = { targetId, targetName }
  if (voterId) body.voterId = voterId
  if (voterName) body.voterName = voterName
  return doRequest<BBEvictionVote>('/eviction/vote', {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export async function bbGetMyVote(): Promise<BBEvictionVote | null> {
  return doRequest<BBEvictionVote | null>('/eviction/my-vote', { method: 'POST' })
}

export async function bbAnnounceEviction(): Promise<BBEviction> {
  return doRequest<BBEviction>('/eviction/result', { method: 'POST' })
}

export async function bbGetEvictionHistory(): Promise<BBEviction[]> {
  return doRequest<BBEviction[]>('/eviction/history')
}

export async function bbRestoreHouseguest(id: string): Promise<BBHouseguest> {
  return doRequest<BBHouseguest>(`/eviction/restore/${id}`, { method: 'POST' })
}

// ===== 日志 =====
export async function bbGetLogs(params?: { page?: number; pageSize?: number }): Promise<{ list: any[]; total: number }> {
  const query = new URLSearchParams()
  if (params?.page) query.append('page', String(params.page))
  if (params?.pageSize) query.append('pageSize', String(params.pageSize))
  const qs = query.toString()
  return doRequest(`/logs${qs ? '?' + qs : ''}`)
}

// ===== 聊天 =====
export async function bbGetChatMessages(params?: { page?: number; pageSize?: number }): Promise<{ messages: BBChatMessage[]; total: number }> {
  const query = new URLSearchParams()
  if (params?.page) query.append('page', String(params.page))
  if (params?.pageSize) query.append('pageSize', String(params.pageSize))
  const qs = query.toString()
  return doRequest(`/chat${qs ? '?' + qs : ''}`)
}

export async function bbGetPrivateChatMessages(targetId: string, params?: { page?: number; pageSize?: number }): Promise<{ messages: BBChatMessage[]; total: number }> {
  const query = new URLSearchParams()
  if (params?.page) query.append('page', String(params.page))
  if (params?.pageSize) query.append('pageSize', String(params.pageSize))
  const qs = query.toString()
  return doRequest(`/chat/private/${targetId}${qs ? '?' + qs : ''}`)
}

export async function bbGetAllPrivateChats(): Promise<{ conversations: { user1Id: string; user1Name: string; user2Id: string; user2Name: string; messages: BBChatMessage[] }[] }> {
  return doRequest('/chat/all-private')
}

export async function bbSendChatMessage(content: string, chatType?: string, targetId?: string, targetName?: string): Promise<BBChatMessage> {
  return doRequest<BBChatMessage>('/chat', {
    method: 'POST',
    body: JSON.stringify({ content, chatType, targetId, targetName })
  })
}

export async function bbDeleteChatMessage(id: string): Promise<void> {
  return doRequest<void>(`/chat/${id}`, { method: 'DELETE' })
}

export async function bbClearChatMessages(chatType?: string): Promise<void> {
  const query = chatType ? `?chatType=${chatType}` : ''
  return doRequest<void>(`/chat${query}`, { method: 'DELETE' })
}

// ===== 小游戏 =====
export async function bbGetMinigameList(): Promise<MinigameDef[]> {
  return doRequest<MinigameDef[]>('/minigame/list')
}

export async function bbCreateMinigameRoom(
  gameType: 'hoh' | 'veto',
  minigameId: string,
  participants: { playerId: string; playerName: string; avatar?: string | null }[]
): Promise<MinigameRoom> {
  return doRequest<MinigameRoom>('/minigame/create-room', {
    method: 'POST',
    body: JSON.stringify({ gameType, minigameId, participants })
  })
}

export async function bbStartMinigame(roomId: string): Promise<void> {
  return doRequest<void>('/minigame/start', {
    method: 'POST',
    body: JSON.stringify({ roomId })
  })
}

export async function bbGetMinigameRoom(roomId: string): Promise<MinigameRoom | null> {
  return doRequest<MinigameRoom | null>(`/minigame/room/${roomId}`)
}

export async function bbGetActiveMinigameRoom(gameType: 'hoh' | 'veto'): Promise<MinigameRoom | null> {
  return doRequest<MinigameRoom | null>(`/minigame/active-room/${gameType}`)
}


