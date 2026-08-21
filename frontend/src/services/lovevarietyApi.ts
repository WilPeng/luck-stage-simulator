import type {
  LVSeason, LVSeasonProgress, LVMenuData, LVPlayer,
  LVPlayerListResponse, LVPlayerStats,
  LVLoveVote, LVPairingResult, LVElimination, LVStageType,
  LVLetter, LVLetterListResponse
} from '../types/lovevariety'

function getApiRoot(): string {
  return ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '') || '/api'
}

const API_BASE = `${getApiRoot()}/lovevariety`

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
export async function lvLogin(loginCode: string): Promise<{ token: string; user: LVPlayer }> {
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

export async function lvGetMyBudget(roundId: string): Promise<{ budget: number }> {
  return doRequest<{ budget: number }>(`/votes/my-budget/${roundId}`)
}

export async function lvSubmitVotes(roundId: string, votes: { targetId: string; targetName: string; value: number }[], totalValue: number): Promise<{ count: number }> {
  return doRequest<{ count: number }>('/votes/submit', {
    method: 'POST',
    body: JSON.stringify({ roundId, votes, totalValue })
  })
}

// 管理员代选手投送喜爱值
export async function lvAdminSubmitVotes(roundId: string, voterId: string, votes: { targetId: string; targetName: string; value: number }[], totalValue: number): Promise<{ count: number; voterName: string }> {
  return doRequest<{ count: number; voterName: string }>('/votes/admin-submit', {
    method: 'POST',
    body: JSON.stringify({ roundId, voterId, votes, totalValue })
  })
}

// 管理员设置选手喜爱值预算（不传 budget 则重新随机）
export async function lvAdminSetBudget(playerId: string, budget?: number): Promise<{ playerId: string; playerName: string; voteBudget: number }> {
  return doRequest<{ playerId: string; playerName: string; voteBudget: number }>('/votes/admin-set-budget', {
    method: 'POST',
    body: JSON.stringify({ playerId, budget })
  })
}

// 管理员批量设置选手预算（不传 budget 则每人随机）
export async function lvAdminBatchSetBudget(playerIds: string[], budget?: number): Promise<{ playerId: string; playerName: string; voteBudget: number }[]> {
  return doRequest<{ playerId: string; playerName: string; voteBudget: number }[]>('/votes/admin-batch-set-budget', {
    method: 'POST',
    body: JSON.stringify({ playerIds, budget })
  })
}

// 管理员一键自动代投（随机分配所有目标并提交）
export async function lvAdminAutoSubmit(roundId: string, voterId: string): Promise<{ count: number; voterName: string; votes: { targetName: string; value: number }[] }> {
  return doRequest<{ count: number; voterName: string; votes: { targetName: string; value: number }[] }>('/votes/admin-auto-submit', {
    method: 'POST',
    body: JSON.stringify({ roundId, voterId })
  })
}

// 管理员撤回选手的投送
export async function lvAdminRevokeVotes(roundId: string, voterId: string): Promise<{ deletedCount: number; voterName: string }> {
  return doRequest<{ deletedCount: number; voterName: string }>('/votes/admin-revoke', {
    method: 'POST',
    body: JSON.stringify({ roundId, voterId })
  })
}

// ===== 配对结算 =====
export async function lvGetPairingHistory(): Promise<any[]> {
  return doRequest<any[]>('/pairing/history')
}

export async function lvGetRoundPairing(roundId: string): Promise<any> {
  return doRequest<any>(`/pairing/round/${roundId}`)
}

export async function lvCalculatePairing(roundId?: string): Promise<LVPairingResult> {
  const body = roundId ? JSON.stringify({ roundId }) : undefined
  return doRequest<LVPairingResult>('/pairing/calculate', {
    method: 'POST',
    ...(body ? { body } : {})
  })
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

// ===== 信件 =====
export async function lvGetAllLetters(params?: { senderId?: string; receiverId?: string; keyword?: string; page?: number; pageSize?: number }): Promise<LVLetterListResponse> {
  const query = new URLSearchParams()
  if (params?.senderId) query.append('senderId', params.senderId)
  if (params?.receiverId) query.append('receiverId', params.receiverId)
  if (params?.keyword) query.append('keyword', params.keyword)
  if (params?.page) query.append('page', String(params.page))
  if (params?.pageSize) query.append('pageSize', String(params.pageSize))
  const qs = query.toString()
  return doRequest<LVLetterListResponse>(`/letters/list${qs ? '?' + qs : ''}`)
}

export async function lvGetInbox(): Promise<LVLetter[]> {
  return doRequest<LVLetter[]>('/letters/inbox')
}

export async function lvGetSentLetters(): Promise<LVLetter[]> {
  return doRequest<LVLetter[]>('/letters/sent')
}

export async function lvSendLetter(data: { receiverId: string; content: string; isAnonymous: boolean }): Promise<LVLetter> {
  return doRequest<LVLetter>('/letters/send', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function lvDeleteLetter(id: string): Promise<void> {
  return doRequest<void>(`/letters/${id}`, { method: 'DELETE' })
}

export async function lvAddLetterCount(data: { playerIds?: string[]; amount: number; letterType?: 'public' | 'anonymous' }): Promise<{ modifiedCount: number }> {
  return doRequest<{ modifiedCount: number }>('/letters/add-count', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

// ===== 头像 =====
export async function lvUploadMyAvatar(file: File, playerId?: string): Promise<{ avatar: string; playerId: string }> {
  const token = getToken()
  const formData = new FormData()
  formData.append('avatar', file)
  if (playerId) formData.append('playerId', playerId)
  const res = await fetch(`${API_BASE}/players/me/avatar`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData
  })
  const text = await res.text()
  let json: any = {}
  try { json = text ? JSON.parse(text) : {} } catch { throw new Error('服务器返回了无效响应') }
  if (!res.ok || json.success === false) throw new Error(json.error || '上传头像失败')
  return json.data
}

export async function lvDeleteMyAvatar(): Promise<void> {
  await fetch(`${API_BASE}/players/me/avatar`, {
    method: 'DELETE',
    headers: buildHeaders()
  })
}

export async function lvUploadPlayerAvatar(playerId: string, file: File): Promise<{ avatar: string; playerId: string }> {
  const token = getToken()
  const formData = new FormData()
  formData.append('avatar', file)
  const res = await fetch(`${API_BASE}/players/${playerId}/avatar`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData
  })
  const text = await res.text()
  let json: any = {}
  try { json = text ? JSON.parse(text) : {} } catch { throw new Error('服务器返回了无效响应') }
  if (!res.ok || json.success === false) throw new Error(json.error || '上传头像失败')
  return json.data
}

export async function lvDeletePlayerAvatar(playerId: string): Promise<void> {
  await fetch(`${API_BASE}/players/${playerId}/avatar`, {
    method: 'DELETE',
    headers: buildHeaders()
  })
}

// ===== 头像备份与恢复 =====
export async function lvDownloadAvatarsZip(): Promise<void> {
  const token = getToken()
  const res = await fetch(`${API_BASE}/players/avatars/download`, {
    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    try {
      const json = JSON.parse(text)
      throw new Error(json.error || `下载头像备份失败 (HTTP ${res.status})`)
    } catch (e: any) {
      if (e.message && !e.message.startsWith('JSON')) throw e
      throw new Error(`下载头像备份失败 (HTTP ${res.status}${text ? ': ' + text.slice(0, 100) : ''})`)
    }
  }
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('zip') && !contentType.includes('octet-stream')) {
    console.warn('[lvDownloadAvatarsZip] 非预期的 Content-Type:', contentType)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'lv-avatars-backup.zip'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function lvRestoreAvatarsFromZip(
  file: File
): Promise<{ success: number; failed: number; errors: string[] }> {
  const token = getToken()
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/players/avatars/restore`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData
  })
  const text = await res.text()
  let json: any = {}
  try { json = text ? JSON.parse(text) : {} } catch { throw new Error('服务器返回了无效响应') }
  if (!res.ok || json.success === false) throw new Error(json.error || '恢复头像失败')
  return json.data
}

export function lvGetAvatarUrl(avatar: string | null | undefined): string | undefined {
  if (!avatar) return undefined
  if (avatar.startsWith('http')) return avatar
  // 如果是相对路径，需要补全为完整 URL
  // 云端（Render）时拼接完整地址，本地开发时直接使用相对路径走 Vite proxy
  const base = API_BASE.startsWith('http') ? API_BASE.replace('/api/lovevariety', '') : ''
  return `${base}${avatar}`
}
