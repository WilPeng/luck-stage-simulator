/**
 * BB House 位置历史
 * 核心：房客只能看到「消息发出时他正在该房间」的消息。
 * 通过记录每次进出房间的时间区间来实现可见性过滤。
 */
const { v4: uuidv4 } = require('uuid')
const BBLocationHistory = require('./models/BBLocationHistory')

const gameId = 'bigbrother'

/** 确保玩家有一条“当前所在”的开放区间（to=null） */
async function ensureOpenInterval(playerId, playerName, roomId, fromIso) {
  const open = await BBLocationHistory.findOne({ playerId, gameId, to: null })
  if (open) {
    if (open.roomId !== roomId) {
      // 修正：关闭旧区间并开启新房间
      await recordMove(playerId, playerName, open.roomId, roomId)
    }
    return
  }
  const from = fromIso || new Date().toISOString()
  const iv = new BBLocationHistory({
    id: uuidv4(), playerId, playerName, roomId, from, to: null, gameId
  })
  await iv.save()
}

/** 记录一次移动：关闭旧的开放区间，开启新房间区间 */
async function recordMove(playerId, playerName, fromRoomId, toRoomId, atIso) {
  const at = atIso || new Date().toISOString()
  const open = await BBLocationHistory.findOne({ playerId, gameId, to: null })
  if (open) {
    open.to = at
    await open.save()
  }
  if (!toRoomId) return
  const iv = new BBLocationHistory({
    id: uuidv4(), playerId, playerName, roomId: toRoomId, from: at, to: null, gameId
  })
  await iv.save()
}

/** 获取玩家在指定房间的所有停留区间 */
async function getIntervalsForRoom(playerId, roomId) {
  const list = await BBLocationHistory.find({ playerId, roomId, gameId })
  return list.map(iv => ({ from: iv.from, to: iv.to }))
}

/** 判断某时间点是否落在区间集合内 */
function isTimeVisible(intervals, createdAt) {
  const t = new Date(createdAt).getTime()
  if (isNaN(t)) return false
  return intervals.some(iv => {
    const from = new Date(iv.from).getTime()
    const to = iv.to ? new Date(iv.to).getTime() : Infinity
    return t >= from && t <= to
  })
}

/** 过滤出玩家可见的消息（消息发出时该玩家在对应房间） */
async function filterVisibleMessages(playerId, roomId, messages) {
  const intervals = await getIntervalsForRoom(playerId, roomId)
  if (!intervals.length) return []
  return messages.filter(m => isTimeVisible(intervals, m.createdAt))
}

module.exports = {
  ensureOpenInterval,
  recordMove,
  getIntervalsForRoom,
  isTimeVisible,
  filterVisibleMessages
}
