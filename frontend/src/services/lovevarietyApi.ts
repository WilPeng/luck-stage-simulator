import type {
  LVSeason, LVSeasonProgress, LVMenuData, LVPlayer,
  LVPlayerListResponse, LVPlayerStats,
  LVLoveVote, LVPairingResult, LVElimination, LVStageType
} from '../types/lovevariety'

const API_BASE = 'https://luck-stage-simulator.onrender.com/api/lovevariety'

function getToken(): string | null {
  const key = 'lovevariety_token'
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
  const json = await res.json()
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
export async function lvLogin(loginCode: string): Promise<{ token: string; user: LVPlayer }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: loginCode })
  })
  const json = await res.json()
  if (res.ok && json.success !== false) {
    return { token: json.token, user: json.data }
  }
  throw new Error(json.error || '登录失败')
}

export async function lvGetCurrentUser(): Promise<LVPlayer> {
  return doRequest<LVPlayer>('/auth/me')
}

export async function lvLogout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: buildHeaders()
    })
  } catch {}
}

// ===== 赛季 =====
export async function lvGetSeason(): Promise<LVSeason> {
  return doRequest<LVSeason>('/season')
}

export async function lvGetSeasonProgress(): Promise<LVSeasonProgress> {
  return doRequest<LVSeasonProgress>('/season/progress')
}

export async function lvGetMenu(): Promise<LVMenuData> {
  return doRequest<LVMenuData>('/season/menu')
}

export async function lvSetStage(round: number, stage: LVStageType): Promise<LVSeason> {
  return doRequest<LVSeason>('/season/set', {
    method: 'POST',
    body: JSON.stringify({ round, stage })
  })
}

export async function lvNextStage(): Promise<LVSeason> {
  return doRequest<LVSeason>('/season/next', { method: 'POST' })
}

export async function lvResetSeason(): Promise<any> {
  return doRequest<any>('/season/reset', { method: 'POST' })
}

export async function lvUpdateRound(params: { totalRounds?: number }): Promise<LVSeason> {
  return doRequest<LVSeason>('/season/round', {
    method: 'PUT',
    body: JSON.stringify(params)
  })
}

// ===== 选手管理 =====
export async function lvGetPlayers(params?: { keyword?: string; status?: string; page?: number; pageSize?: number }): Promise<LVPlayerListResponse> {
  const query = new URLSearchParams()
  if (params?.keyword) query.append('keyword', params.keyword)
  if (params?.status) query.append('status', params.status)
  if (params?.page) query.append('page', String(params.page))
  if (params?.pageSize) query.append('pageSize', String(params.pageSize))
  const qs = query.toString()
  return doRequest<LVPlayerListResponse>(`/players${qs ? '?' + qs : ''}`)
}

export async function lvGetPlayerStats(): Promise<LVPlayerStats> {
  return doRequest<LVPlayerStats>('/players/stats')
}

export async function lvGetActivePlayers(): Promise<{ id: string; name: string; avatar: string | null; status: string }[]> {
  return doRequest('/players/active')
}

export async function lvCreatePlayer(data: { name: string; loginCode: string }): Promise<LVPlayer> {
  return doRequest<LVPlayer>('/players', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function lvUpdatePlayer(id: string, data: { name?: string; status?: string }): Promise<LVPlayer> {
  return doRequest<LVPlayer>(`/players/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  })
}

export async function lvDeletePlayer(id: string): Promise<void> {
  return doRequest<void>(`/players/${id}`, { method: 'DELETE' })
}

// ===== 喜爱值投送 =====
export async function lvGetVoteHistory(): Promise<LVLoveVote[]> {
  return doRequest<LVLoveVote[]>('/votes/history')
}

export async function lvGetRoundVotes(roundId: string): Promise<LVLoveVote[]> {
  return doRequest<LVLoveVote[]>(`/votes/round/${roundId}`)
}

export async function lvGetMyVotes(roundId: string): Promise<LVLoveVote[]> {
  return doRequest<LVLoveVote[]>(`/votes/my-votes/${roundId}`)
}

export async function lvSubmitVotes(roundId: string, votes: { targetId: string; targetName: string; value: number }[], totalValue: number): Promise<{ count: number }> {
  return doRequest<{ count: number }>('/votes/submit', {
    method: 'POST',
    body: JSON.stringify({ roundId, votes, totalValue })
  })
}

// ===== 配对结算 =====
export async function lvGetPairingHistory(): Promise<any[]> {
  return doRequest<any[]>('/pairing/history')
}

export async function lvGetRoundPairing(roundId: string): Promise<any> {
  return doRequest<any>(`/pairing/round/${roundId}`)
}

export async function lvCalculatePairing(): Promise<LVPairingResult> {
  return doRequest<LVPairingResult>('/pairing/calculate', { method: 'POST' })
}

// ===== 淘汰管理 =====
export async function lvGetEliminationHistory(): Promise<LVElimination[]> {
  return doRequest<LVElimination[]>('/elimination/history')
}

export async function lvGetRoundEliminations(roundId: string): Promise<LVElimination[]> {
  return doRequest<LVElimination[]>(`/elimination/round/${roundId}`)
}

export async function lvEliminatePlayer(playerId: string, playerName: string): Promise<LVElimination> {
  return doRequest<LVElimination>('/elimination/eliminate', {
    method: 'POST',
    body: JSON.stringify({ playerId, playerName })
  })
}

export async function lvRestorePlayer(id: string): Promise<LVPlayer> {
  return doRequest<LVPlayer>(`/elimination/restore/${id}`, { method: 'POST' })
}
