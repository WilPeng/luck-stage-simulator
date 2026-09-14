/**
 * 小游戏对局记录 / 复盘
 * - 每个房间在内存中维护一份 session（含完整事件日志）
 * - 通过 WebSocket 实时推送事件给观战的管理员
 * - 游戏结束时落库，供赛后复盘查看
 */
const { generateId } = require('./helpers')
const BBMinigameReplay = require('./models/BBMinigameReplay')

const sessions = new Map() // roomId -> session

function startSession(room) {
  const session = {
    id: generateId(),
    roomId: room.roomId,
    gameType: room.gameType,
    minigameId: room.minigameId,
    minigameName: room.minigameName || room.minigameId,
    category: room.category || '',
    roundIndex: room.roundIndex ?? null,
    roundId: room.roundId || '',
    targetScore: room.targetScore ?? null,
    participants: (room.participants || []).map(p => ({
      playerId: p.playerId,
      playerName: p.playerName || '',
      avatar: p.avatar || null
    })),
    status: 'playing',
    startedAt: new Date().toISOString(),
    endedAt: null,
    winner: null,
    winners: [],
    scores: {},
    finalStates: {},
    events: [],
    gameId: 'bigbrother',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  sessions.set(room.roomId, session)
  room.replaySession = session
  return session
}

function getSession(roomId) {
  return sessions.get(roomId) || null
}

// 记录一条事件，返回事件对象（含时间戳）
function recordEvent(room, ev) {
  const s = sessions.get(room.roomId) || room.replaySession
  if (!s) return null
  const event = {
    t: Date.now(),
    playerId: ev.playerId || null,
    playerName: ev.playerName || '',
    type: ev.type || 'event',
    text: ev.text || '',
    data: ev.data === undefined ? null : ev.data
  }
  s.events.push(event)
  return event
}

// 结束并落库
async function finalizeSession(room, { winner = null, winners = [], scores = {}, status = 'finished' } = {}) {
  const s = sessions.get(room.roomId) || room.replaySession
  if (!s) return null
  s.status = status
  s.winner = winner || null
  s.winners = winners || []
  s.scores = scores || {}
  try {
    s.finalStates = room.handler && room.handler.getAllStates ? room.handler.getAllStates(room.gameState) : {}
  } catch { s.finalStates = {} }
  s.endedAt = new Date().toISOString()
  s.updatedAt = s.endedAt
  sessions.delete(room.roomId)
  room.replaySession = null
  try {
    const doc = new BBMinigameReplay(s)
    await doc.save()
    return doc
  } catch (e) {
    console.error('[MinigameReplay] save failed', e)
    return null
  }
}

function listLiveSessions() {
  return Array.from(sessions.values())
}

module.exports = { startSession, getSession, recordEvent, finalizeSession, listLiveSessions }
