import type {
  BBSeason, BBSeasonProgress, BBMenuData, BBHouseguest,
  BBHouseguestListResponse, BBHouseguestStats, BBHohRecord,
  BBNomination, BBVetoRecord, BBEvictionVote, BBEviction,
  BBChatMessage, BBVoteResult, BBStageType
} from '../types/bigbrother'

const API_BASE = 'https://luck-stage-simulator.onrender.com/api/bigbrother'

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

export async function bbUpdateRound(params: { totalRounds?: number }): Promise<BBSeason> {
  return doRequest<BBSeason>('/season/round', {
    method: 'PUT',
    body: JSON.stringify(params)
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

export async function bbRunHohCompetition(): Promise<BBHohRecord> {
  return doRequest<BBHohRecord>('/hoh/competition', { method: 'POST' })
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

export async function bbRunVetoCompetition(): Promise<BBVetoRecord> {
  return doRequest<BBVetoRecord>('/veto/competition', { method: 'POST' })
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

export async function bbSendChatMessage(content: string): Promise<BBChatMessage> {
  return doRequest<BBChatMessage>('/chat', {
    method: 'POST',
    body: JSON.stringify({ content })
  })
}

export async function bbDeleteChatMessage(id: string): Promise<void> {
  return doRequest<void>(`/chat/${id}`, { method: 'DELETE' })
}

export async function bbClearChatMessages(): Promise<void> {
  return doRequest<void>('/chat', { method: 'DELETE' })
}
