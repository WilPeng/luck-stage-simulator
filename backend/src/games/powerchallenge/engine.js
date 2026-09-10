const PCSeason = require('./models/PCSeason')
const PCPlayer = require('./models/PCPlayer')
const { sample } = require('./helpers')

let io = null
const onlinePlayers = new Map() // playerId -> { name }

// 简单串行任务链：确保回合关键写入不会并发丢更新
let chain = Promise.resolve()
function enqueue(fn) {
  const p = chain.then(() => fn())
  chain = p.catch(() => {})
  return p
}

const setIo = (ioRef) => { io = ioRef }

// ================= 赛季加载 / 默认初始化 =================
async function ensureSeason() {
  let season = await PCSeason.findOne({ gameId: 'powerchallenge' })
  if (!season) {
    season = new PCSeason({
      id: require('crypto').randomUUID(),
      gameId: 'powerchallenge',
      name: '实力大挑战',
      totalRounds: 5,
      answerCooldown: 3,
      status: 'idle',
      currentRound: 1,
      roundPhase: 'waiting',
      alivePlayers: [],
      points: {},
      eliminated: [],
      started: false
    })
    await season.save()
  }
  const players = await PCPlayer.find({ gameId: 'powerchallenge', role: 'player', status: 'active' })
  const aliveIds = season.alivePlayers || []
  if (!aliveIds.length) {
    season.alivePlayers = players.map(p => p.id)
    await season.save()
  }
  return season
}

async function getPlayersMap() {
  const players = await PCPlayer.find({ gameId: 'powerchallenge', role: 'player', status: 'active' })
  const map = {}
  for (const p of players) map[p.id] = p.name
  return map
}

function broadcastToLive(event, payload) {
  if (io) io.of('/powerchallenge').to('pc-live').emit(event, payload)
}

async function pushState() {
  broadcastToLive('pc:state', await publicSummary())
}

// ================= 在线状态 =================
function playerConnected(playerId, playerName) {
  if (!onlinePlayers.has(playerId)) onlinePlayers.set(playerId, { name: playerName })
  pushPresence()
}

// 玩家断开：仅当该玩家没有任何剩余在线连接时才移除
function playerDisconnected(playerId) {
  const ns = io ? io.of('/powerchallenge') : null
  if (!ns) { onlinePlayers.delete(playerId); pushPresence(); return }
  const sockets = ns.sockets
  let stillOnline = false
  for (const s of sockets.values()) {
    if ((s.user?.userId || s.user?.id) === playerId && s.connected) { stillOnline = true; break }
  }
  if (!stillOnline) onlinePlayers.delete(playerId)
  pushPresence()
}

function playerJoinArena(playerId, playerName) {
  if (!onlinePlayers.has(playerId)) onlinePlayers.set(playerId, { name: playerName })
  pushPresence()
}

function playerLeaveArena(playerId) {
  if (onlinePlayers.has(playerId)) {
    onlinePlayers.delete(playerId)
    pushPresence()
  }
}

function pushPresence() {
  broadcastToLive('pc:presence', { online: Array.from(onlinePlayers.entries()).map(([id, v]) => ({ playerId: id, playerName: v.name })) })
}

// 本轮在线参与玩家 = 仍存活(season.alivePlayers) + 当前在线
async function onlineAlivePlayers() {
  const season = await ensureSeason()
  const alive = new Set(season.alivePlayers || [])
  return Array.from(onlinePlayers.keys()).filter(pid => alive.has(pid))
}

// ================= 公开/管理快照 =================
async function publicSummary() {
  const season = await ensureSeason()
  const players = await getPlayersMap()
  const o = season.toObject()
  return {
    id: o.id,
    status: o.status,
    roundPhase: o.roundPhase,
    currentRound: o.currentRound,
    totalRounds: o.totalRounds,
    answerCooldown: o.answerCooldown,
    theme: o.theme,
    started: o.started,
    alivePlayers: (o.alivePlayers || []).map(pid => ({ playerId: pid, playerName: players[pid] || '玩家' })),
    eliminated: o.eliminated || [],
    points: o.points || {},
    champion: o.champion,
    ranking: o.ranking || [],
    releasedQuestions: o.releasedQuestions || [],
    participants: (o.participants || []).map(p => ({ ...p })),
    claims: o.claims || [],
    winners: o.winners || [],
    eliminatedThisRound: o.eliminatedThisRound || []
  }
}

async function adminFull() {
  const season = await ensureSeason()
  const players = await PCPlayer.find({ gameId: 'powerchallenge' })
  const o = season.toObject()
  return {
    ...o,
    players: players.map(p => p.toObject()),
    online: Array.from(onlinePlayers.entries()).map(([id, v]) => ({ playerId: id, playerName: v.name }))
  }
}

// ================= 回合开始（内部，不带锁） =================
async function startRoundInternal() {
  const season = await ensureSeason()
  if (season.status === 'finished') return { success: false, error: '赛季已结束，请先重置' }
  if (season.roundPhase === 'answering' || season.roundPhase === 'countdown') {
    return { success: false, error: '本轮正在进行中' }
  }
  if (season.roundPhase === 'ended') return { success: false, error: '本轮已结束，请进入下一轮' }

  if (!season.questions || season.questions.length === 0) {
    return { success: false, error: '本轮尚未配置题目，请先在管理端编辑本轮主题与题目' }
  }

  const alive = await onlineAlivePlayers()
  const playersMap = await getPlayersMap()
  const participantIds = alive.filter(pid => playersMap[pid])
  if (participantIds.length < 2) {
    return { success: false, error: '本轮需至少2名在线存活玩家' }
  }

  const releasedCount = participantIds.length - 1
  if (season.questions.length < releasedCount) {
    return { success: false, error: `题目不足：本轮需放出 ${releasedCount} 题，当前仅有 ${season.questions.length} 题` }
  }

  const picked = sample(season.questions, releasedCount)
  const released = picked.map(q => ({ id: q.id, text: q.text, options: q.options || [] }))

  season.status = 'running'
  season.roundPhase = 'countdown'
  season.started = true
  season.releasedQuestions = released
  season.participants = participantIds.map(pid => ({ playerId: pid, playerName: playersMap[pid] }))
  season.claims = []
  season.attempts = {}
  season.cooldownUntil = {}
  season.winners = []
  season.eliminatedThisRound = []
  await season.save()
  await pushState()

  // 3秒倒计时
  broadcastToLive('pc:round_start', {
    round: season.currentRound,
    theme: season.theme,
    participants: season.participants,
    questionCount: released.length
  })
  let cd = 3
  broadcastToLive('pc:countdown', { seconds: cd })
  const timer = setInterval(async () => {
    cd -= 1
    broadcastToLive('pc:countdown', { seconds: cd })
    if (cd <= 0) {
      clearInterval(timer)
      const s2 = await ensureSeason()
      if (s2.roundPhase !== 'countdown') return
      s2.roundPhase = 'answering'
      await s2.save()
      await pushState()
      broadcastToLive('pc:round_started', {
        round: s2.currentRound,
        theme: s2.theme,
        questions: s2.releasedQuestions,
        cooldown: s2.answerCooldown
      })
    }
  }, 1000)

  return { success: true, message: '本轮已开始' }
}

// ================= 答题判定（内部） =================
async function submitAnswerInternal(playerId, payload) {
  const season = await ensureSeason()
  if (season.status !== 'running' || season.roundPhase !== 'answering') {
    return { success: false, error: '当前不在答题时间' }
  }
  const { questionId, answer } = payload || {}
  if (!questionId || answer == null) return { success: false, error: '缺少答题参数' }

  const participant = (season.participants || []).find(p => p.playerId === playerId)
  if (!participant) return { success: false, error: '你不是本轮参赛玩家' }

  if ((season.winners || []).includes(playerId)) {
    return { success: false, error: '你已答对并晋级，不能再作答' }
  }

  const released = season.releasedQuestions || []
  const qPublic = released.find(q => q.id === questionId)
  if (!qPublic) return { success: false, error: '题目不存在或未放出' }
  if (season.claims.some(c => c.questionId === questionId)) {
    return { success: false, error: '该题晋级名额已被抢占' }
  }

  // 提交间隔(cooldown)
  const cooldownUntil = season.cooldownUntil || {}
  const now = Date.now()
  const allowedAfter = cooldownUntil[playerId] || 0
  if (now < allowedAfter) {
    return { success: false, error: `请等待 ${Math.ceil((allowedAfter - now) / 1000)} 秒后再作答`, cooldownMs: allowedAfter - now }
  }
  cooldownUntil[playerId] = now + season.answerCooldown * 1000
  season.cooldownUntil = cooldownUntil

  const attempts = season.attempts || {}
  const myAttempts = attempts[playerId] || []
  if (myAttempts.includes(questionId)) {
    return { success: false, error: '此题你已经作答过' }
  }
  myAttempts.push(questionId)
  attempts[playerId] = myAttempts
  season.attempts = attempts

  const bankQuestion = (season.questions || []).find(q => q.id === questionId)
  const correct = bankQuestion && String(bankQuestion.correctAnswer) === String(answer)

  if (correct) {
    season.claims = season.claims || []
    season.claims.push({ questionId, playerId, playerName: participant.playerName })
    const winners = season.winners || []
    if (!winners.includes(playerId)) winners.push(playerId)
    season.winners = winners
    const remaining = (season.releasedQuestions || []).length - (season.claims || []).length
    await season.save()
    await pushState()
    broadcastToLive('pc:claimed', { questionId, playerId, playerName: participant.playerName, remaining })
    // 全部名额被占 → 自动收尾
    if (remaining <= 0) {
      await endRoundInternal()
    }
    return { success: true, correct: true, claimed: true }
  }

  await season.save()
  return { success: true, correct: false, claimed: false }
}

// ================= 回合收尾（内部） =================
async function endRoundInternal() {
  const season = await ensureSeason()
  if (season.roundPhase !== 'answering') return { success: false, error: '当前没有进行中的回合' }
  await finalizeRound(season)
  await pushState()
  const s = await ensureSeason()
  if (s.status === 'finished') {
    broadcastToLive('pc:season_finished', {
      champion: s.champion,
      ranking: s.ranking,
      eliminatedThisRound: s.eliminatedThisRound
    })
  } else {
    broadcastToLive('pc:round_ended', {
      round: s.currentRound,
      eliminatedThisRound: s.eliminatedThisRound,
      nextRound: s.currentRound + 1
    })
  }
  return { success: true }
}

async function finalizeRound(season) {
  const winnerIds = new Set(season.winners || [])
  const eliminatedThisRound = (season.participants || [])
    .map(p => p.playerId)
    .filter(pid => !winnerIds.has(pid))

  const nowRound = season.currentRound
  const points = season.points || {}
  for (const pid of (season.participants || []).map(p => p.playerId)) {
    if (winnerIds.has(pid)) points[pid] = (points[pid] || 0) + 1
  }
  season.points = points

  const alive = (season.alivePlayers || []).slice()
  for (const pid of eliminatedThisRound) {
    const player = (season.participants || []).find(p => p.playerId === pid)
    const pName = player ? player.playerName : '玩家'
    if (alive.includes(pid)) {
      alive.splice(alive.indexOf(pid), 1)
      season.eliminated = season.eliminated || []
      season.eliminated.push({ round: nowRound, playerId: pid, playerName: pName })
    }
  }
  season.alivePlayers = alive
  season.eliminatedThisRound = eliminatedThisRound
  season.roundPhase = 'ended'
  await season.save()

  const finishedByRounds = nowRound >= season.totalRounds
  const finishedByPlayers = alive.length <= 1
  if (finishedByRounds || finishedByPlayers) {
    season.status = 'finished'
    season.started = false
    await computeRanking(season)
  }
}

async function computeRanking(season) {
  const allPlayers = await PCPlayer.find({ gameId: 'powerchallenge', role: 'player', status: 'active' })
  const alive = new Set(season.alivePlayers || [])
  const eliminatedMap = {}
  for (const e of season.eliminated || []) eliminatedMap[e.playerId] = e.round
  const points = season.points || {}
  const roster = allPlayers.map(p => ({
    playerId: p.id,
    playerName: p.name,
    points: points[p.id] || 0,
    alive: alive.has(p.id),
    eliminatedRound: eliminatedMap[p.id] || null
  }))
  const sorted = roster.sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1
    if (b.points !== a.points) return b.points - a.points
    return (a.eliminatedRound || 999) - (b.eliminatedRound || 999)
  })
  const champion = sorted.length ? { playerId: sorted[0].playerId, playerName: sorted[0].playerName } : null
  season.champion = champion
  season.ranking = sorted.map((r, idx) => ({ ...r, rank: idx + 1 }))
  await season.save()
}

// ================= 下一轮（内部） =================
async function prepareNextRoundInternal() {
  const season = await ensureSeason()
  if (season.status === 'finished') return { success: false, error: '赛季已结束' }
  if (season.roundPhase !== 'ended') return { success: false, error: '本轮尚未结算' }
  season.roundPhase = 'waiting'
  season.currentRound += 1
  season.theme = ''
  season.questions = []
  season.releasedQuestions = []
  season.participants = []
  season.claims = []
  season.attempts = {}
  season.cooldownUntil = {}
  season.winners = []
  season.eliminatedThisRound = []
  season.status = 'running'
  await season.save()
  await pushState()
  return { success: true, nextRound: season.currentRound }
}

// ================= 保存本轮配置（内部） =================
async function saveRoundConfigInternal(data = {}) {
  const season = await ensureSeason()
  if (season.roundPhase === 'answering' || season.roundPhase === 'countdown') {
    return { success: false, error: '本轮正在进行中，无法修改' }
  }
  if (data.totalRounds != null && data.totalRounds >= 1) season.totalRounds = Number(data.totalRounds)
  if (data.answerCooldown != null && data.answerCooldown >= 0) season.answerCooldown = Number(data.answerCooldown)
  if (typeof data.theme === 'string') season.theme = data.theme
  if (Array.isArray(data.questions)) {
    season.questions = data.questions.map(q => ({
      id: q.id || require('crypto').randomUUID(),
      text: q.text || '',
      options: q.options || [],
      correctAnswer: q.correctAnswer || ''
    }))
  }
  await season.save()
  await pushState()
  return { success: true }
}

// ================= 重置整季（内部） =================
async function resetSeasonInternal() {
  const season = await ensureSeason()
  const players = await PCPlayer.find({ gameId: 'powerchallenge', role: 'player', status: 'active' })
  season.status = 'idle'
  season.roundPhase = 'waiting'
  season.currentRound = 1
  season.theme = ''
  season.questions = []
  season.releasedQuestions = []
  season.participants = []
  season.claims = []
  season.attempts = {}
  season.cooldownUntil = {}
  season.winners = []
  season.eliminatedThisRound = []
  season.alivePlayers = players.map(p => p.id)
  season.points = {}
  season.eliminated = []
  season.champion = null
  season.ranking = []
  season.started = false
  await season.save()
  await pushState()
  return { success: true }
}

// 带锁的公开接口
const startRound = () => enqueue(startRoundInternal)
const submitAnswer = (playerId, payload) => enqueue(() => submitAnswerInternal(playerId, payload))
const endRound = () => enqueue(endRoundInternal)
const prepareNextRound = () => enqueue(prepareNextRoundInternal)
const saveRoundConfig = (data) => enqueue(() => saveRoundConfigInternal(data || {}))
const resetSeason = () => enqueue(resetSeasonInternal)

module.exports = {
  setIo,
  ensureSeason,
  getPlayersMap,
  publicSummary,
  adminFull,
  startRound,
  submitAnswer,
  endRound,
  prepareNextRound,
  saveRoundConfig,
  resetSeason,
  onlinePlayers,
  playerConnected,
  playerDisconnected,
  playerJoinArena,
  playerLeaveArena
}
