import type {
  BBSeason, BBSeasonProgress, BBMenuData, BBHouseguest,
  BBHouseguestListResponse, BBHouseguestStats, BBHohRecord,
  BBNomination, BBElectionCampaign, BBVetoRecord, BBEvictionVote, BBEviction,
  BBChatMessage, BBVoteResult, BBStageType,
  BBTwistRoundConfig, BBTwistDef, BBRoundConfig,
  MinigameDef, MinigameRoom, MinigameProgress, BBSettlement, BBEndgameStatus,
  BBCustomGameDef, BBGameLibrary, BBGameFolder
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

export async function doRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
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
async function authRequest(path: string, username: string, password: string): Promise<{ token: string; user: BBHouseguest }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const text = await res.text()
  let json: any = {}
  try { json = text ? JSON.parse(text) : {} } catch { throw new Error('服务器返回了无效响应') }
  if (res.ok && json.success !== false) {
    return { token: json.token, user: json.data }
  }
  const err = new Error(json.error || '登录失败')
  ;(err as any).status = res.status
  ;(err as any).code = json?.code
  throw err
}

export async function bbLogin(username: string, password: string): Promise<{ token: string; user: BBHouseguest }> {
  return authRequest('/auth/login', username, password)
}

export async function bbAdminLogin(username: string, password: string): Promise<{ token: string; user: BBHouseguest }> {
  return authRequest('/auth/admin/login', username, password)
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

export async function bbChangePassword(oldPassword: string, newPassword: string): Promise<void> {
  return doRequest<void>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ oldPassword, newPassword })
  })
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

// 季终结算汇总（管理端）
export async function bbGetSeasonSettlement(): Promise<BBSettlement> {
  return doRequest<BBSettlement>('/season/settlement')
}

// ===== 终局（F3 / 冠军投票） =====
export async function bbGetEndgameStatus(): Promise<BBEndgameStatus> {
  return doRequest<BBEndgameStatus>('/season/endgame/status')
}

export async function bbResetEndgame(): Promise<any> {
  return doRequest('/season/endgame/reset', { method: 'POST' })
}

export async function bbFinal3Round(params: {
  roundIndex: number; winnerId: string; winnerName?: string
}): Promise<any> {
  return doRequest('/season/endgame/final3', {
    method: 'POST',
    body: JSON.stringify(params)
  })
}

export async function bbFhohPick(pickedId: string, pickedName?: string): Promise<any> {
  return doRequest('/season/endgame/fhoh-pick', {
    method: 'POST',
    body: JSON.stringify({ pickedId, pickedName })
  })
}

export async function bbChampionVote(targetId: string, targetName?: string, voterId?: string, voterName?: string): Promise<any> {
  const body: any = { targetId, targetName }
  if (voterId) { body.voterId = voterId; body.voterName = voterName || '' }
  return doRequest('/season/endgame/champion-vote', {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export async function bbChampionResult(): Promise<any> {
  return doRequest('/season/endgame/champion-result', { method: 'POST' })
}

// ===== 冠军揭晓（逐句） =====
export async function bbPrepareChampionReveal(order?: string[]): Promise<any> {
  return doRequest('/season/endgame/champion-reveal/prepare', {
    method: 'POST',
    body: JSON.stringify({ order })
  })
}

export async function bbReorderChampionReveal(order: string[]): Promise<any> {
  return doRequest('/season/endgame/champion-reveal/reorder', {
    method: 'POST',
    body: JSON.stringify({ order })
  })
}

export async function bbNextChampionReveal(): Promise<any> {
  return doRequest('/season/endgame/champion-reveal/next', { method: 'POST' })
}

export async function bbResetChampionReveal(): Promise<any> {
  return doRequest('/season/endgame/champion-reveal/reset', { method: 'POST' })
}

// ===== 直接民主投票 =====
export async function bbVoteNominees(votes: { voterId: string; voterName: string; targetId: string; targetName: string }[]): Promise<any> {
  return doRequest('/nomination/vote-nominees', {
    method: 'POST',
    body: JSON.stringify({ votes })
  })
}

// ===== 房客管理 =====
export async function bbGetHouseguests(params?: { keyword?: string; status?: string; role?: string; page?: number; pageSize?: number }): Promise<BBHouseguestListResponse> {
  const query = new URLSearchParams()
  if (params?.keyword) query.append('keyword', params.keyword)
  if (params?.status) query.append('status', params.status)
  if (params?.role) query.append('role', params.role)
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

// HOH 竞赛可参赛名单（活跃房客，排除上一轮 HOH）
export async function bbGetHohEligible(): Promise<{
  candidates: { id: string; name: string; avatar: string | null }[]
  excludedHoh: { id: string; name: string } | null
}> {
  return doRequest('/hoh/eligible')
}

export async function bbCreateHouseguest(data: { name: string; username?: string; password?: string; role?: string; permissions?: string[]; isSuperAdmin?: boolean }): Promise<BBHouseguest> {
  return doRequest<BBHouseguest>('/houseguests', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function bbUpdateHouseguest(id: string, data: { name?: string; username?: string; password?: string; status?: string; isHaveNot?: boolean; role?: string; permissions?: string[]; isSuperAdmin?: boolean }): Promise<BBHouseguest> {
  return doRequest<BBHouseguest>(`/houseguests/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  })
}

export async function bbDeleteHouseguest(id: string): Promise<void> {
  return doRequest<void>(`/houseguests/${id}`, { method: 'DELETE' })
}

export async function bbBatchDeleteHouseguests(ids: string[]): Promise<{ deleted: number; skipped: number }> {
  return doRequest<{ deleted: number; skipped: number }>('/houseguests/batch-delete', {
    method: 'POST',
    body: JSON.stringify({ ids })
  })
}

// ===== 头像 =====

/** 将存储路径转为可访问的完整 URL */
export function bbGetAvatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null
  if (avatar.startsWith('http') || avatar.startsWith('data:') || avatar.startsWith('blob:')) return avatar
  // 云端（Render）时拼接完整地址，本地开发时直接使用相对路径，走 Vite proxy
  const base = API_BASE.startsWith('http') ? API_BASE.replace('/api/bigbrother', '') : ''
  const path = avatar.startsWith('/') ? avatar : `/${avatar}`
  return `${base}${path}`
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

// BBBB 比赛胜者（安全）
export async function bbSetBbbbWinner(playerId: string, playerName: string): Promise<any> {
  return doRequest<any>('/nomination/bbbb-winner', {
    method: 'POST',
    body: JSON.stringify({ playerId, playerName })
  })
}

export async function bbReplaceNomination(playerId: string, playerName: string): Promise<BBNomination> {
  return doRequest<BBNomination>('/nomination/replace', {
    method: 'POST',
    body: JSON.stringify({ playerId, playerName })
  })
}

// ===== 撤销（管理员） =====
export async function bbUndoHoh(): Promise<void> {
  return doRequest<void>('/hoh/undo', { method: 'POST' })
}
export async function bbUndoNomination(): Promise<void> {
  return doRequest<void>('/nomination/undo', { method: 'POST' })
}
export async function bbUndoVetoCompetition(): Promise<void> {
  return doRequest<void>('/veto/undo-competition', { method: 'POST' })
}
export async function bbUndoVetoDecision(): Promise<void> {
  return doRequest<void>('/veto/undo-decision', { method: 'POST' })
}
export async function bbUndoReplacement(): Promise<void> {
  return doRequest<void>('/nomination/replace/undo', { method: 'POST' })
}

// 召集所有选手到指定页面
export async function bbSummonPage(path: string): Promise<void> {
  return doRequest<void>('/season/summon', { method: 'POST', body: JSON.stringify({ path }) })
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

// POV 抽卡（存活>6）
export async function bbVetoCardDeal(): Promise<any> {
  return doRequest<any>('/veto/card-deal', { method: 'POST', body: JSON.stringify({}) })
}
export async function bbVetoCardDraw(): Promise<any> {
  return doRequest<any>('/veto/card-draw', { method: 'POST', body: JSON.stringify({}) })
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

export async function bbVetoCeremonyStart(): Promise<BBVetoRecord> {
  return doRequest<BBVetoRecord>('/veto/ceremony-start', { method: 'POST' })
}

export async function bbVetoSaveDrafts(drafts: { opening?: string; use?: string; skip?: string; closing?: string }): Promise<BBVetoRecord> {
  return doRequest<BBVetoRecord>('/veto/drafts', {
    method: 'POST',
    body: JSON.stringify({ drafts })
  })
}

export async function bbVetoSpeech(phase: 'opening' | 'closing', text?: string): Promise<BBVetoRecord> {
  return doRequest<BBVetoRecord>('/veto/speech', {
    method: 'POST',
    body: JSON.stringify({ phase, text })
  })
}

export async function bbGetVetoHistory(): Promise<BBVetoRecord[]> {
  return doRequest<BBVetoRecord[]>('/veto/history')
}

export async function bbGetVetoPickable(): Promise<{ canPick: boolean; role?: string; pickablePlayers: { playerId: string; playerName: string }[] }> {
  return doRequest('/veto/pickable')
}

// ===== 淘汰投票 =====
export async function bbGetVotes(): Promise<BBVoteResult> {
  return doRequest<BBVoteResult>('/eviction/votes')
}

// 拉票内容：投票开始前仅本人/管理员可见，开始后所有人可见
export async function bbGetEvictionCampaign(): Promise<{ voteStarted: boolean; campaigns: BBElectionCampaign[] }> {
  return doRequest('/eviction/campaign')
}

export async function bbSubmitEvictionCampaign(content: string): Promise<BBElectionCampaign> {
  return doRequest('/eviction/campaign', {
    method: 'POST',
    body: JSON.stringify({ content })
  })
}

export async function bbStartEvictionVote(): Promise<{ voteStarted: boolean; voteStartedAt: string; campaigns: BBElectionCampaign[] }> {
  return doRequest('/eviction/start-vote', {
    method: 'POST',
    body: JSON.stringify({})
  })
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
  return doRequest<BBEvictionVote | null>('/eviction/my-vote')
}

export async function bbAnnounceEviction(): Promise<BBEviction> {
  return doRequest<BBEviction>('/eviction/result', { method: 'POST' })
}

// ===== 淘汰结果分段宣布 =====
export async function bbGetEvictionAnnounce(): Promise<any> {
  return doRequest<any>('/eviction/announce')
}
export async function bbPrepareEvictionAnnounce(segments: { type: string; text: string }[]): Promise<any> {
  return doRequest<any>('/eviction/announce/prepare', { method: 'POST', body: JSON.stringify({ segments }) })
}
export async function bbNextEvictionAnnounce(): Promise<any> {
  return doRequest<any>('/eviction/announce/next', { method: 'POST', body: JSON.stringify({}) })
}
export async function bbResetEvictionAnnounce(): Promise<any> {
  return doRequest<any>('/eviction/announce/reset', { method: 'POST', body: JSON.stringify({}) })
}

// ===== 淘汰夜（锁票 + 宣布框架 + 开门） =====
export async function bbGetEvictionNight(): Promise<{ night: any; votesLocked: boolean }> {
  const res = await doRequest<any>('/eviction/night')
  return { night: (res as any)?.data ?? res ?? null, votesLocked: !!(res as any)?.votesLocked }
}
export async function bbStartEvictionNight(sentenceMode: 3 | 5 = 3): Promise<any> {
  return doRequest<any>('/eviction/night/start', { method: 'POST', body: JSON.stringify({ sentenceMode }) })
}
export async function bbConfirmEvictionNight(): Promise<any> {
  return doRequest<any>('/eviction/night/confirm', { method: 'POST', body: JSON.stringify({}) })
}
export async function bbNextEvictionNight(): Promise<any> {
  return doRequest<any>('/eviction/night/next', { method: 'POST', body: JSON.stringify({}) })
}
export async function bbResetEvictionNight(): Promise<any> {
  return doRequest<any>('/eviction/night/reset', { method: 'POST', body: JSON.stringify({}) })
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
  gameType: 'hoh' | 'veto' | 'bbbb' | 'finale',
  minigameId: string,
  participants: { playerId: string; playerName: string; avatar?: string | null }[],
  targetScore?: number | null,
  options?: Record<string, any>
): Promise<MinigameRoom> {
  return doRequest<MinigameRoom>('/minigame/create-room', {
    method: 'POST',
    body: JSON.stringify({ gameType, minigameId, participants, targetScore, options: options || {} })
  })
}

// 上传前压缩图片，避免超过服务器/反向代理的请求体限制（常见为 1MB）
const IMAGE_UPLOAD_MAX_BYTES = 800 * 1024
const IMAGE_UPLOAD_MAX_DIM = 1600

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality))
}

async function compressImageForUpload(file: File): Promise<File> {
  if (typeof document === 'undefined') return file
  const compressible = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  if (!compressible || file.size <= IMAGE_UPLOAD_MAX_BYTES) return file

  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = async () => {
      try {
        const scale = Math.min(1, IMAGE_UPLOAD_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight))
        const width = Math.max(1, Math.round(img.naturalWidth * scale))
        const height = Math.max(1, Math.round(img.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(file); return }
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        let quality = 0.85
        let blob = await canvasToBlob(canvas, quality)
        while (blob && blob.size > IMAGE_UPLOAD_MAX_BYTES && quality > 0.5) {
          quality -= 0.1
          blob = await canvasToBlob(canvas, quality)
        }
        if (!blob || blob.size >= file.size) { resolve(file); return }
        const base = file.name.replace(/\.[^.]+$/, '') || 'image'
        resolve(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }))
      } catch {
        resolve(file)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

// 上传小游戏图片（拼图）
export async function bbUploadGameImage(file: File): Promise<{ url: string }> {
  const uploadFile = await compressImageForUpload(file)
  const fd = new FormData()
  fd.append('image', uploadFile)
  const token = getToken()
  const res = await fetch(`${API_BASE}/minigame/upload-image`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) {
    if (res.status === 413) throw new Error('图片过大，上传被服务器或反向代理拒绝')
    throw new Error(json.error || '图片上传失败')
  }
  return json.data
}

// 上传比赛内容音乐/视频附件
// 直接上传在部分反向代理（默认 1MB）下会返回 413 Request Entity Too Large，
// 因此小文件直传，大文件自动改为分片上传（每片 < 1MB）。
const MEDIA_DIRECT_MAX = 800 * 1024

async function uploadMediaDirect(file: File): Promise<{ url: string; kind: 'audio' | 'video'; mime: string; name: string }> {
  const fd = new FormData()
  fd.append('media', file)
  const token = getToken()
  const res = await fetch(`${API_BASE}/minigame/upload-media`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) {
    const err: any = new Error(json.error || (res.status === 413 ? '文件过大，正在尝试分片上传' : '媒体上传失败'))
    err.status = res.status
    throw err
  }
  return json.data
}

async function uploadMediaChunked(file: File): Promise<{ url: string; kind: 'audio' | 'video'; mime: string; name: string }> {
  const token = getToken()
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  const initRes = await fetch(`${API_BASE}/minigame/upload-media/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ name: file.name, mime: file.type, size: file.size })
  })
  const initJson = await initRes.json().catch(() => ({}))
  if (!initRes.ok || initJson.success === false) {
    throw new Error(initJson.error || '初始化分片上传失败')
  }
  const { uploadId, chunkSize } = initJson.data || {}
  const size = Math.max(1, Number(chunkSize) || MEDIA_DIRECT_MAX)
  const totalChunks = Math.max(1, Math.ceil(file.size / size))

  async function sendChunk(index: number): Promise<void> {
    const start = index * size
    const blob = file.slice(start, Math.min(file.size, start + size))
    let lastErr: any = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const fd = new FormData()
        fd.append('chunk', blob, `chunk-${index}`)
        fd.append('uploadId', uploadId)
        fd.append('index', String(index))
        const res = await fetch(`${API_BASE}/minigame/upload-media/chunk`, {
          method: 'POST',
          headers: authHeaders,
          body: fd
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || json.success === false) throw new Error(json.error || `第 ${index + 1} 个分片上传失败`)
        return
      } catch (e) {
        lastErr = e
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)))
      }
    }
    throw lastErr || new Error(`第 ${index + 1} 个分片上传失败`)
  }

  for (let i = 0; i < totalChunks; i++) {
    await sendChunk(i)
  }

  const doneRes = await fetch(`${API_BASE}/minigame/upload-media/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ uploadId, totalChunks })
  })
  const doneJson = await doneRes.json().catch(() => ({}))
  if (!doneRes.ok || doneJson.success === false) {
    throw new Error(doneJson.error || '合并分片失败')
  }
  return doneJson.data
}

export async function bbUploadGameMedia(file: File): Promise<{ url: string; kind: 'audio' | 'video'; mime: string; name: string }> {
  if (file.size <= MEDIA_DIRECT_MAX) {
    try {
      return await uploadMediaDirect(file)
    } catch (e: any) {
      // 反向代理限制过小时自动回退到分片上传
      if (e && e.status === 413) return uploadMediaChunked(file)
      throw e
    }
  }
  return uploadMediaChunked(file)
}

export async function bbStartMinigame(roomId: string, countdownSeconds: number = 10): Promise<void> {
  return doRequest<void>('/minigame/start', {
    method: 'POST',
    body: JSON.stringify({ roomId, countdownSeconds })
  })
}

export async function bbGetMinigameRoom(roomId: string): Promise<MinigameRoom | null> {
  return doRequest<MinigameRoom | null>(`/minigame/room/${roomId}`)
}

export async function bbGetActiveMinigameRoom(gameType: 'hoh' | 'veto' | 'finale'): Promise<MinigameRoom | null> {
  return doRequest<MinigameRoom | null>(`/minigame/active-room/${gameType}`)
}

// 管理员手动指定胜者并结束比赛
export async function bbSetMinigameWinner(roomId: string, playerId: string): Promise<{ winner: { playerId: string; playerName: string } }> {
  return doRequest<{ winner: { playerId: string; playerName: string } }>('/minigame/set-winner', {
    method: 'POST',
    body: JSON.stringify({ roomId, playerId })
  })
}

// 获取房间实时进度（管理员轮询）
export async function bbGetMinigameRoomProgress(roomId: string): Promise<MinigameProgress | null> {
  return doRequest<MinigameProgress | null>(`/minigame/room-progress/${roomId}`)
}

// 管理员暂停游戏
export async function bbPauseMinigame(roomId: string): Promise<void> {
  return doRequest<void>('/minigame/pause', {
    method: 'POST',
    body: JSON.stringify({ roomId })
  })
}

// 管理员恢复游戏
export async function bbResumeMinigame(roomId: string): Promise<void> {
  return doRequest<void>('/minigame/resume', {
    method: 'POST',
    body: JSON.stringify({ roomId })
  })
}

// 管理员停止游戏（无胜者）
export async function bbStopMinigame(roomId: string): Promise<void> {
  return doRequest<void>('/minigame/stop', {
    method: 'POST',
    body: JSON.stringify({ roomId })
  })
}

// 管理员召集选手进入准备环节
export async function bbSummonMinigamePlayers(roomId: string): Promise<any> {
  return doRequest<any>('/minigame/summon', {
    method: 'POST',
    body: JSON.stringify({ roomId })
  })
}

export interface Poker17RoomPlayer {
  playerId: string
  playerName: string
  avatar?: string | null
  connected?: boolean
  ready?: boolean
}

// ===== 小游戏实时观战 & 复盘 =====
export async function bbGetActiveMinigameRooms(): Promise<any[]> {
  return doRequest<any[]>('/minigame/active-rooms')
}

export async function bbGetMinigameReplays(params?: { gameType?: string; minigameId?: string; limit?: number }): Promise<any[]> {
  const qs = new URLSearchParams()
  if (params?.gameType) qs.set('gameType', params.gameType)
  if (params?.minigameId) qs.set('minigameId', params.minigameId)
  if (params?.limit) qs.set('limit', String(params.limit))
  const q = qs.toString()
  return doRequest<any[]>(`/minigame/replays${q ? '?' + q : ''}`)
}

export async function bbGetMinigameReplay(id: string): Promise<any> {
  return doRequest<any>(`/minigame/replay/${id}`)
}

export async function bbDeleteMinigameReplay(id: string): Promise<void> {
  return doRequest<void>(`/minigame/replay/${id}`, { method: 'DELETE' })
}

export async function bbBatchDeleteMinigameReplays(ids: string[]): Promise<{ deleted: number }> {
  return doRequest<{ deleted: number }>('/minigame/replay/batch-delete', {
    method: 'POST',
    body: JSON.stringify({ ids })
  })
}

// ===== 钥匙仪式（提名） =====
export async function bbKeySetup(nominees: string[], order: string[], extra?: { openingText?: string; closingReason?: string }): Promise<any> {
  return doRequest<any>('/nomination/key-setup', { method: 'POST', body: JSON.stringify({ nominees, order, ...(extra || {}) }) })
}
export async function bbKeyStart(): Promise<any> {
  return doRequest<any>('/nomination/key-start', { method: 'POST', body: JSON.stringify({}) })
}
export async function bbKeyDraw(): Promise<any> {
  return doRequest<any>('/nomination/key-draw', { method: 'POST', body: JSON.stringify({}) })
}
export async function bbKeyAnnounce(text: string): Promise<any> {
  return doRequest<any>('/nomination/key-announce', { method: 'POST', body: JSON.stringify({ text }) })
}
export async function bbKeySpeech(payload: { phase: 'opening' | 'closing'; text?: string; reason?: string; nomineeOrder?: string[] }): Promise<any> {
  return doRequest<any>('/nomination/key-speech', { method: 'POST', body: JSON.stringify(payload) })
}

// ===== 陪审团问答（冠军投票前） =====
export async function bbGetJuryQA(): Promise<any[]> {
  return doRequest<any[]>('/jury-qa')
}
export async function bbAskJuryQuestion(question: string): Promise<any> {
  return doRequest<any>('/jury-qa/ask', { method: 'POST', body: JSON.stringify({ question }) })
}
export async function bbAnswerJuryQuestion(questionId: string, answer: string): Promise<any> {
  return doRequest<any>('/jury-qa/answer', { method: 'POST', body: JSON.stringify({ questionId, answer }) })
}
export async function bbDeleteJuryQuestion(id: string): Promise<void> {
  return doRequest<void>(`/jury-qa/${id}`, { method: 'DELETE' })
}

// ===== 自定义游戏 API =====

export async function bbGetCustomGameList(): Promise<BBCustomGameDef[]> {
  return doRequest<BBCustomGameDef[]>('/custom-game/list')
}

export async function bbGetCustomGame(id: string): Promise<BBCustomGameDef> {
  return doRequest<BBCustomGameDef>(`/custom-game/${id}`)
}

export async function bbCreateCustomGame(data: Partial<BBCustomGameDef>): Promise<BBCustomGameDef> {
  return doRequest<BBCustomGameDef>('/custom-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

export async function bbUpdateCustomGame(id: string, data: Partial<BBCustomGameDef>): Promise<BBCustomGameDef> {
  return doRequest<BBCustomGameDef>(`/custom-game/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

export async function bbDeleteCustomGame(id: string): Promise<void> {
  return doRequest<void>(`/custom-game/${id}`, {
    method: 'DELETE'
  })
}

export async function bbToggleCustomGame(id: string): Promise<{ id: string; enabled: boolean }> {
  return doRequest<{ id: string; enabled: boolean }>(`/custom-game/${id}/toggle`, {
    method: 'POST'
  })
}

// ===== 游戏库排序 / 文件夹 API =====

export async function bbGetGameLibrary(): Promise<BBGameLibrary> {
  return doRequest<BBGameLibrary>('/game-library')
}

export async function bbSaveGameLibraryOrder(order: string[]): Promise<{ order: string[] }> {
  return doRequest<{ order: string[] }>('/game-library/order', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order })
  })
}

export async function bbCreateGameFolder(name: string): Promise<BBGameFolder> {
  return doRequest<BBGameFolder>('/game-library/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
}

export async function bbUpdateGameFolder(id: string, data: { name?: string; games?: string[] }): Promise<BBGameFolder> {
  return doRequest<BBGameFolder>(`/game-library/folders/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

export async function bbToggleGameInFolder(folderId: string, gameKey: string): Promise<BBGameFolder> {
  return doRequest<BBGameFolder>(`/game-library/folders/${folderId}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameKey })
  })
}

export async function bbDeleteGameFolder(id: string): Promise<void> {
  return doRequest<void>(`/game-library/folders/${id}`, { method: 'DELETE' })
}

// ===== 实力大挑战 API =====

export async function bbGetPowerChallengePools(): Promise<PowerChallengePool[]> {
  return doRequest<PowerChallengePool[]>('/power-challenge/list')
}

export async function bbGetPowerChallengePool(id: string): Promise<PowerChallengePool> {
  return doRequest<PowerChallengePool>(`/power-challenge/${id}`)
}

export async function bbCreatePowerChallengePool(data: { name: string; theme: string; questions: PowerChallengeQuestion[] }): Promise<PowerChallengePool> {
  return doRequest<PowerChallengePool>('/power-challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

export async function bbUpdatePowerChallengePool(id: string, data: Partial<{ name: string; theme: string; questions: PowerChallengeQuestion[] }>): Promise<PowerChallengePool> {
  return doRequest<PowerChallengePool>(`/power-challenge/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

export async function bbDeletePowerChallengePool(id: string): Promise<void> {
  return doRequest<void>(`/power-challenge/${id}`, { method: 'DELETE' })
}

export async function bbTogglePowerChallengePool(id: string): Promise<PowerChallengePool> {
  return doRequest<PowerChallengePool>(`/power-challenge/${id}/toggle`, { method: 'POST' })
}


