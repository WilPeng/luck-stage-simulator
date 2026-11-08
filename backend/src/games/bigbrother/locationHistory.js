/**
 * BB House 位置历史
 * 核心：房客只能看到「消息发出时他正在该房间」的消息。
 * 通过记录每次进出房间的时间区间来实现可见性过滤。
 */
const { v4: uuidv4 } = require('uuid')
const BBLocationHistory = require('./models/BBLocationHistory')
const sleepHistory = require('./sleepHistory')

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

/** 过滤出玩家可见的消息（优先使用发送时的 visibleTo 快照，旧消息按位置历史兜底） */
async function filterVisibleMessages(playerId, roomId, messages) {
  const hasLegacy = messages.some(m => !Array.isArray(m.visibleTo))
  // 全部是新消息时直接按快照过滤，无需查询位置/睡眠记录
  if (!hasLegacy) {
    return messages.filter(m => m.visibleTo.includes(playerId))
  }
  const intervals = await getIntervalsForRoom(playerId, roomId)
  const visible = messages.filter(m => {
    // 新消息：发送时已确定可见者快照（睡眠中的玩家已被排除）
    if (Array.isArray(m.visibleTo)) return m.visibleTo.includes(playerId)
    // 旧消息：按位置历史判断
    return isTimeVisible(intervals, m.createdAt)
  })
  const legacy = visible.filter(m => !Array.isArray(m.visibleTo))
  if (!legacy.length) return visible
  // 旧消息仍需按睡眠时间兜底
  const awake = await sleepHistory.filterAwakeMessages(playerId, legacy)
  const awakeIds = new Set(awake.map(m => m.id))
  return visible.filter(m => Array.isArray(m.visibleTo) || awakeIds.has(m.id))
}

module.exports = {
  ensureOpenInterval,
  recordMove,
  getIntervalsForRoom,
  isTimeVisible,
  filterVisibleMessages
}
