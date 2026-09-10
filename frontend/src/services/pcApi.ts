import type { PCPlayer, PCSeason, PCSeasonAdmin, PCPowerChallenge, PCPowerChallengeQuestion } from '../types/powerchallenge'

function getApiRoot(): string {
  return ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '') || '/api'
}

const API_BASE = `${getApiRoot()}/powerchallenge`

function getToken(): string | null {
  const key = 'powerchallenge_token'
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

// ================== 认证 ==================
export async function pcLogin(code: string): Promise<{ user: PCPlayer; token: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  })
  const text = await res.text()
  const json = text ? JSON.parse(text) : {}
  if (!res.ok || json.success === false) {
    throw new Error(json?.error || `登录失败 (HTTP ${res.status})`)
  }
  return { user: json.data, token: json.token }
}

export async function pcGetCurrentUser(): Promise<PCPlayer> {
  return doRequest<PCPlayer>('/auth/me')
}

export async function pcLogout(): Promise<void> {
  return doRequest('/auth/logout', { method: 'POST' })
}

// ================== 赛季摘要 / 配置 ==================
export async function pcGetSeason(): Promise<PCSeason | null> {
  return doRequest<PCSeason>('/season')
}

export async function pcGetProgress(): Promise<PCSeason | null> {
  return doRequest<PCSeason>('/season/progress')
}

export async function pcGetSeasonAdmin(): Promise<PCSeasonAdmin | null> {
  return doRequest<PCSeasonAdmin>('/season/admin')
}

export async function pcSaveSeasonConfig(data: {
  totalRounds?: number
  answerCooldown?: number
  theme?: string
  questions?: PCPowerChallengeQuestion[]
}): Promise<{ success: boolean; error?: string }> {
  return doRequest('/season/set', { method: 'POST', body: JSON.stringify(data) })
}

export async function pcStartRound(): Promise<{ success: boolean; error?: string }> {
  return doRequest('/season/start', { method: 'POST', body: JSON.stringify({}) })
}

export async function pcEndRound(): Promise<{ success: boolean; error?: string }> {
  return doRequest('/season/end', { method: 'POST', body: JSON.stringify({}) })
}

export async function pcNextRound(): Promise<{ success: boolean; error?: string; nextRound?: number }> {
  return doRequest('/season/next', { method: 'POST', body: JSON.stringify({}) })
}

export async function pcResetSeason(): Promise<{ success: boolean; error?: string }> {
  return doRequest('/season/reset', { method: 'POST', body: JSON.stringify({}) })
}

// ================== 玩家 ==================
export async function pcGetPlayers(): Promise<PCPlayer[]> {
  return doRequest<PCPlayer[]>('/players')
}

export async function pcGetActivePlayers(): Promise<PCPlayer[]> {
  return doRequest<PCPlayer[]>('/players/active')
}

export async function pcGetPlayerStats(): Promise<{ total: number; active: number }> {
  return doRequest<{ total: number; active: number }>('/players/stats')
}

export async function pcGetPlayer(id: string): Promise<PCPlayer> {
  return doRequest<PCPlayer>(`/players/${id}`)
}

export async function pcCreatePlayer(data: { name: string; loginCode: string; role?: string }): Promise<PCPlayer> {
  return doRequest<PCPlayer>('/players', { method: 'POST', body: JSON.stringify(data) })
}

export async function pcUpdatePlayer(id: string, data: Partial<PCPlayer>): Promise<PCPlayer> {
  return doRequest<PCPlayer>(`/players/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function pcDeletePlayer(id: string): Promise<void> {
  return doRequest(`/players/${id}`, { method: 'DELETE' })
}

// ================== 题目池 ==================
export async function pcGetPools(): Promise<PCPowerChallenge[]> {
  return doRequest<PCPowerChallenge[]>('/power-challenge/list')
}

export async function pcGetPool(id: string): Promise<PCPowerChallenge> {
  return doRequest<PCPowerChallenge>(`/power-challenge/${id}`)
}

export async function pcCreatePool(data: { name: string; theme: string; questions: PCPowerChallengeQuestion[] }): Promise<PCPowerChallenge> {
  return doRequest<PCPowerChallenge>('/power-challenge', { method: 'POST', body: JSON.stringify(data) })
}

export async function pcUpdatePool(id: string, data: Partial<{ name: string; theme: string; questions: PCPowerChallengeQuestion[] }>): Promise<PCPowerChallenge> {
  return doRequest<PCPowerChallenge>(`/power-challenge/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function pcDeletePool(id: string): Promise<void> {
  return doRequest(`/power-challenge/${id}`, { method: 'DELETE' })
}

export async function pcTogglePool(id: string): Promise<PCPowerChallenge> {
  return doRequest<PCPowerChallenge>(`/power-challenge/${id}/toggle`, { method: 'POST' })
}
