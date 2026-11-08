/**
 * 睡眠时间段记录与可见性过滤
 * 核心：睡眠期间（从入睡到玩家实际点击“醒来”）产生的聊天消息，
 * 即使醒来后也不能看到。
 */
const BBSleepRecord = require('./models/BBSleepRecord')

const gameId = 'bigbrother'

async function startSleep(playerId, atIso) {
  const at = atIso || new Date().toISOString()
  // 防御：已有未结束记录时先关闭，避免出现重叠区间
  const open = await BBSleepRecord.findOne({ playerId, gameId, to: null })
  if (open) {
    open.to = at
    open.updatedAt = at
    await open.save()
  }
  const rec = new BBSleepRecord({
    id: crypto.randomUUID(),
    playerId,
    gameId,
    from: at,
    to: null
  })
  await rec.save()
  return rec.toObject()
}

async function endSleep(playerId, atIso, fallbackFromIso) {
  const at = atIso || new Date().toISOString()
  const open = await BBSleepRecord.findOne({ playerId, gameId, to: null })
  if (!open) {
    // 兼容升级前已开始的睡眠：用当时的入睡时间补一条完整区间
    if (!fallbackFromIso) return false
    const rec = new BBSleepRecord({
      id: crypto.randomUUID(),
      playerId,
      gameId,
      from: fallbackFromIso,
      to: at
    })
    await rec.save()
    return true
  }
  open.to = at
  open.updatedAt = at
  await open.save()
  return true
}

async function getSleepIntervals(playerId) {
  const list = await BBSleepRecord.find({ playerId, gameId })
  return list.map(rec => ({ from: rec.from, to: rec.to }))
}

function isTimeSleeping(intervals, createdAt) {
  const t = new Date(createdAt).getTime()
  if (Number.isNaN(t)) return false
  return intervals.some(iv => {
    const from = new Date(iv.from).getTime()
    const to = iv.to ? new Date(iv.to).getTime() : Infinity
    return t >= from && t <= to
  })
}

/** 过滤掉玩家睡眠期间产生的消息（保留清醒时可见的消息） */
async function filterAwakeMessages(playerId, messages) {
  const intervals = await getSleepIntervals(playerId)
  if (!intervals.length) return messages
  return messages.filter(m => !isTimeSleeping(intervals, m.createdAt))
}

module.exports = {
  startSleep,
  endSleep,
  getSleepIntervals,
  isTimeSleeping,
  filterAwakeMessages
}
