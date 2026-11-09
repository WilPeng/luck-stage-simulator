const { getCollection } = require('../../config/db')
const BBHouseguest = require('./models/BBHouseguest')
const BBSeason = require('./models/BBSeason')
const { getEvictCountForRound } = require('./helpers')

const GAME_ID = 'bigbrother'

function roundNumber(roundId) {
  const n = Number(String(roundId || '').replace('round-', ''))
  return Number.isFinite(n) ? n : 0
}

function lastNormalRoundOf(season) {
  if (season?.final3Round) return season.final3Round - 1
  return Math.max(1, (season?.totalRounds || 3) - 2)
}

function isEndgameSeason(season) {
  return !!(
    (season?.final3Round && season.currentRound >= season.final3Round) ||
    season?.currentStage === 'final3' ||
    season?.currentStage === 'champion_vote'
  )
}

function scheduleError(message, code = 'WALK_SCHEDULE_INVALID') {
  const err = new Error(message)
  err.code = code
  return err
}

function clone(value) {
  if (value == null) return value
  return JSON.parse(JSON.stringify(value))
}

function snapshotSeasonEndgame(season) {
  return {
    finalTwo: clone(season.finalTwo),
    fhohId: season.fhohId,
    fhohName: season.fhohName,
    lastJuryId: season.lastJuryId,
    lastJuryName: season.lastJuryName,
    final3Winners: clone(season.final3Winners),
    championId: season.championId,
    championName: season.championName,
    runnerUpId: season.runnerUpId,
    runnerUpName: season.runnerUpName,
    championReveal: clone(season.championReveal),
    status: season.status
  }
}

/**
 * 从赛程中删除一个普通轮次。
 * 规则：
 *  - 只能删除当前轮或未来普通轮，不能删除已完成的轮次；
 *  - 只能删除 F3 之前的普通轮；
 *  - 若删除的是当前轮，需要当前轮尚未开始（hoh_competition）或 force=true；
 *  - 被删除轮次必须只产生 1 个淘汰名额（双淘汰轮删除会打乱人数平衡，拒绝）。
 * 返回撤销所需快照。
 */
function removeRoundFromSchedule(season, removeRound, options = {}) {
  const force = options.force === true
  const round = Number(removeRound)
  const lastNormal = lastNormalRoundOf(season)
  if (!Number.isInteger(round) || round < 1) {
    throw scheduleError('删除轮次必须为 >= 1 的整数', 'INVALID_ROUND')
  }
  if (round < (season.currentRound || 1)) {
    throw scheduleError(`第 ${round} 轮已完成，不能删除已结束的轮次`, 'ROUND_ALREADY_PLAYED')
  }
  if (round > lastNormal) {
    throw scheduleError(`只能删除 F3 之前的普通轮次（当前最后普通轮为第 ${lastNormal} 轮）`, 'ROUND_NOT_NORMAL')
  }
  if (round === season.currentRound && season.currentStage !== 'hoh_competition' && !force) {
    throw scheduleError('当前轮次已经开始，请选择一个未来的普通轮次（或确认强制删除当前轮）', 'ROUND_IN_PROGRESS')
  }
  const evictCount = getEvictCountForRound(round, season.twistConfigs || [], season.roundConfigs || [])
  if (evictCount > 1) {
    throw scheduleError(`第 ${round} 轮为双淘汰轮（${evictCount} 人），退赛只减少 1 个淘汰名额，请选择单淘汰轮`, 'ROUND_MULTI_EVICT')
  }

  const snapshot = {
    didRemoveRound: true,
    removeRound: round,
    removedRoundConfig: clone((season.roundConfigs || []).find(r => r.round === round)) || null,
    removedTwistConfig: clone((season.twistConfigs || []).find(r => r.round === round)) || null,
    prevFinal3Round: season.final3Round ?? null,
    prevChampionRound: season.championRound ?? null,
    prevTotalRounds: season.totalRounds ?? null,
    prevCurrentRound: season.currentRound,
    prevCurrentStage: season.currentStage,
    ...snapshotSeasonEndgame(season)
  }

  season.roundConfigs = (season.roundConfigs || [])
    .filter(r => r.round !== round)
    .map(r => ({ ...r, round: r.round > round ? r.round - 1 : r.round }))
  season.twistConfigs = (season.twistConfigs || [])
    .filter(r => r.round !== round)
    .map(r => ({ ...r, round: r.round > round ? r.round - 1 : r.round }))

  if (season.final3Round) season.final3Round = Math.max(1, season.final3Round - 1)
  if (season.championRound) season.championRound = Math.max(1, season.championRound - 1)
  season.totalRounds = Math.max(1, (season.totalRounds || 1) - 1)

  if (round === season.currentRound) {
    // 当前轮被删除后，原下一周顶替到当前轮号；重置为新一轮开始
    if (season.final3Round && season.currentRound === season.final3Round) {
      season.currentStage = 'final3'
    } else {
      season.currentStage = 'hoh_competition'
    }
  }

  return snapshot
}

/** 清空指定轮次的比赛记录（仅在强制删除当前轮时使用） */
async function clearRoundRecords(round) {
  const roundId = `round-${round}`
  const filter = { gameId: GAME_ID, roundId }
  await Promise.all([
    getCollection('BBHohRecord').deleteMany(filter),
    getCollection('BBNomination').deleteMany(filter),
    getCollection('BBVetoRecord').deleteMany(filter),
    getCollection('BBEvictionVote').deleteMany(filter),
    getCollection('BBEviction').deleteMany(filter)
  ])
}

/**
 * 将退赛者从「退赛轮次及之后」的比赛数据中移除，避免后续页面读到已退赛的人。
 * 已完成轮次的历史数据保持不动。
 */
async function detachPlayerFromActiveRounds(playerId, fromRound) {
  const from = Number(fromRound) || 1

  // 淘汰投票
  const voteCol = getCollection('BBEvictionVote')
  const votes = await voteCol.find({
    gameId: GAME_ID,
    $or: [{ voterId: playerId }, { targetId: playerId }]
  }).toArray()
  const voteIds = votes.filter(v => roundNumber(v.roundId) >= from).map(v => v.id)
  if (voteIds.length) await voteCol.deleteMany({ gameId: GAME_ID, id: { $in: voteIds } })

  // 提名
  const nomCol = getCollection('BBNomination')
  const noms = await nomCol.find({ gameId: GAME_ID }).toArray()
  for (const nom of noms) {
    if (roundNumber(nom.roundId) < from) continue
    const ids = Array.isArray(nom.nomineeIds) ? nom.nomineeIds : []
    const names = Array.isArray(nom.nomineeNames) ? nom.nomineeNames : []
    const nextIds = []
    const nextNames = []
    ids.forEach((id, i) => {
      if (id !== playerId) {
        nextIds.push(id)
        nextNames.push(names[i] || '')
      }
    })
    const sets = {}
    if (nextIds.length !== ids.length) {
      sets.nomineeIds = nextIds
      sets.nomineeNames = nextNames
    }
    if (nom.replacementNomineeId === playerId) {
      sets.replacementNomineeId = null
      sets.replacementNomineeName = ''
    }
    if (nom.bbbbWinnerId === playerId) {
      sets.bbbbWinnerId = null
      sets.bbbbWinnerName = ''
    }
    if (Array.isArray(nom.campaigns) && nom.campaigns.some(c => c.playerId === playerId)) {
      sets.campaigns = nom.campaigns.filter(c => c.playerId !== playerId)
    }
    if (Object.keys(sets).length) {
      await nomCol.updateOne(
        { gameId: GAME_ID, id: nom.id },
        { $set: { ...sets, updatedAt: new Date().toISOString() } }
      )
    }
  }

  // 否决权
  const vetoCol = getCollection('BBVetoRecord')
  const vetos = await vetoCol.find({ gameId: GAME_ID }).toArray()
  for (const veto of vetos) {
    if (roundNumber(veto.roundId) < from) continue
    const sets = {}
    if (Array.isArray(veto.participants)) {
      const filtered = veto.participants.filter(p => p.playerId !== playerId)
      if (filtered.length !== veto.participants.length) sets.participants = filtered
    }
    if (veto.winnerId === playerId) {
      sets.winnerId = null
      sets.winnerName = ''
      sets.status = 'pending'
      sets.used = false
    }
    if (veto.usedOnPlayerId === playerId) {
      sets.usedOnPlayerId = null
      sets.usedOnPlayerName = ''
      sets.used = false
    }
    if (veto.cardDraw && Array.isArray(veto.cardDraw.participants)) {
      const filtered = veto.cardDraw.participants.filter(p => p.playerId !== playerId)
      if (filtered.length !== veto.cardDraw.participants.length) {
        sets.cardDraw = { ...veto.cardDraw, participants: filtered }
      }
    }
    if (Object.keys(sets).length) {
      await vetoCol.updateOne(
        { gameId: GAME_ID, id: veto.id },
        { $set: { ...sets, updatedAt: new Date().toISOString() } }
      )
    }
  }

  // HOH
  const hohCol = getCollection('BBHohRecord')
  const hohs = await hohCol.find({ gameId: GAME_ID }).toArray()
  for (const hoh of hohs) {
    if (roundNumber(hoh.roundId) < from) continue
    if (hoh.winnerId === playerId) {
      await hohCol.deleteOne({ gameId: GAME_ID, id: hoh.id })
      continue
    }
    if (Array.isArray(hoh.participants)) {
      const filtered = hoh.participants.filter(p => p.playerId !== playerId)
      if (filtered.length !== hoh.participants.length) {
        await hohCol.updateOne(
          { gameId: GAME_ID, id: hoh.id },
          { $set: { participants: filtered, updatedAt: new Date().toISOString() } }
        )
      }
    }
  }

  // 毒蛇标记
  try {
    await getCollection('BBSerpentMark').deleteMany({
      gameId: GAME_ID,
      $or: [{ playerId }, { targetId: playerId }]
    })
  } catch (e) { /* ignore */ }

  // 冠军投票（退赛者不能继续投票，也不能再作为被投对象）
  try {
    await getCollection('BBChampionVote').deleteMany({
      gameId: GAME_ID,
      $or: [{ voterId: playerId }, { targetId: playerId }]
    })
  } catch (e) { /* ignore */ }
}

/** 清理 season 内对该玩家的引用 */
function detachPlayerFromSeason(season, playerId) {
  if (season.nextHohPlayerId === playerId) {
    season.nextHohPlayerId = null
    season.nextHohPlayerName = ''
  }
  if (season.fhohId === playerId) {
    season.fhohId = null
    season.fhohName = ''
  }
  if (season.lastJuryId === playerId) {
    season.lastJuryId = null
    season.lastJuryName = ''
  }
  if (season.championId === playerId) {
    season.championId = null
    season.championName = ''
    season.status = 'running'
  }
  if (season.runnerUpId === playerId) {
    season.runnerUpId = null
    season.runnerUpName = ''
  }
  if (season.finalTwo && Array.isArray(season.finalTwo)) {
    season.finalTwo = season.finalTwo.filter(f => f.playerId !== playerId)
  }
  if (season.final3Winners && typeof season.final3Winners === 'object') {
    for (const key of Object.keys(season.final3Winners)) {
      if (season.final3Winners[key]?.playerId === playerId) delete season.final3Winners[key]
    }
  }
  if (season.championReveal?.segments) {
    season.championReveal.segments = season.championReveal.segments.filter(
      s => s.juryId !== playerId && s.targetId !== playerId
    )
  }
}

/** 退赛后处理终局异常（人数不足 3 时提前进入冠军投票 / 结算） */
async function reconcileEndgameAfterWalk(season, walkedPlayer) {
  if (!season.final3Round) return
  const actives = await getCollection('BBHouseguest')
    .find({ gameId: GAME_ID, role: 'houseguest', status: 'active' })
    .toArray()

  if (season.currentStage === 'champion_vote') {
    const finalTwo = season.finalTwo || []
    if (finalTwo.length === 2) {
      const remaining = finalTwo.filter(f => f.playerId !== walkedPlayer?.id && actives.some(a => a.id === f.playerId))
      if (remaining.length === 1) {
        season.finalTwo = remaining
        season.championId = remaining[0].playerId
        season.championName = remaining[0].playerName || remaining[0].name || ''
        season.status = 'finished'
      }
    }
    return
  }

  if (season.currentRound >= season.final3Round) {
    if (actives.length === 2 && (season.finalTwo || []).length < 2) {
      season.finalTwo = actives.map(a => ({ playerId: a.id, playerName: a.name, name: a.name }))
      season.currentRound = season.championRound || (season.final3Round + 1)
      season.currentStage = 'champion_vote'
    } else if (actives.length === 1) {
      season.championId = actives[0].id
      season.championName = actives[0].name
      season.status = 'finished'
    }
  }
}

async function ensurePlayerLocation(player) {
  try {
    const BBPlayerLocation = require('./models/BBPlayerLocation')
    await BBPlayerLocation.deleteMany({ gameId: GAME_ID, playerId: player.id })
    const loc = new BBPlayerLocation({
      id: player.id,
      playerId: player.id,
      playerName: player.name,
      currentRoomId: player.currentRoomId || 'living_room',
      enteredAt: new Date().toISOString(),
      gameId: GAME_ID
    })
    await loc.save()
  } catch (e) { /* ignore */ }
}

/**
 * 标记选手退赛
 * @param {Object} params
 * @param {string} params.playerId
 * @param {number} [params.walkedRound] 从第几轮起显示 walked（默认当前轮）
 * @param {number} [params.removeRound]  要删除的未来普通轮（默认最后一个普通轮）
 * @param {string} [params.note]
 * @param {boolean} [params.force] 是否允许强制删除已开始的当前轮
 */
async function markWalk({ playerId, walkedRound, removeRound, note, force }) {
  const player = await BBHouseguest.findOne({ id: playerId, gameId: GAME_ID })
  if (!player) throw scheduleError('房客不存在', 'NOT_FOUND')
  if (player.role !== 'houseguest') throw scheduleError('管理员不能退赛', 'NOT_HOUSEGUEST')
  if (player.status === 'walked') throw scheduleError('该选手已经是退赛状态', 'ALREADY_WALKED')
  if (!['active', 'f2'].includes(player.status)) {
    throw scheduleError('只有仍在比赛的选手可以退赛（已淘汰/陪审团选手不能退赛）', 'NOT_ACTIVE')
  }

  const season = await BBSeason.findOne({ gameId: GAME_ID })
  if (!season) throw scheduleError('赛季不存在', 'NO_SEASON')
  if (!isEndgameSeason(season) && player.status !== 'active') {
    throw scheduleError('只有活跃状态的选手可以退赛', 'NOT_ACTIVE')
  }

  // 记录该玩家当前轮的角色，退赛清理后提示管理员补充
  const warnings = []
  try {
    const roundId = `round-${season.currentRound}`
    const hoh = await getCollection('BBHohRecord').findOne({ gameId: GAME_ID, roundId })
    if (hoh?.winnerId === player.id) {
      warnings.push('该选手是当前轮 HOH，已从本轮记录中移除，请重新进行 HOH 竞争')
    }
    const nom = await getCollection('BBNomination').findOne({ gameId: GAME_ID, roundId })
    const nomineeIds = [...(nom?.nomineeIds || [])]
    if (nom?.replacementNomineeId) nomineeIds.push(nom.replacementNomineeId)
    if (nomineeIds.includes(player.id)) {
      warnings.push('该选手是当前轮被提名者，已从提名名单中移除，请检查提名是否仍完整')
    }
    const veto = await getCollection('BBVetoRecord').findOne({ gameId: GAME_ID, roundId })
    if (veto?.winnerId === player.id) {
      warnings.push('该选手是当前轮否决权获得者，已移除，请重新进行否决权竞争')
    }
  } catch (e) { /* ignore */ }

  const endgame = isEndgameSeason(season)
  const lastNormal = lastNormalRoundOf(season)
  let walkRound = Number(walkedRound)
  if (!Number.isInteger(walkRound) || walkRound < 1) walkRound = season.currentRound
  if (!endgame) {
    if (walkRound < season.currentRound) {
      throw scheduleError(`退赛轮次不能早于当前第 ${season.currentRound} 轮`, 'WALK_ROUND_PAST')
    }
    if (walkRound > lastNormal) {
      throw scheduleError(`退赛轮次必须在 F3 之前（最晚第 ${lastNormal} 轮）`, 'WALK_ROUND_AFTER_NORMAL')
    }
  }

  let snapshot = null
  let displayWalkRound = walkRound

  if (!endgame) {
    let roundToRemove = Number(removeRound)
    if (!Number.isInteger(roundToRemove) || roundToRemove < 1) roundToRemove = lastNormal
    // 删除当前轮时清空本轮已有比赛记录（仅允许在未开始或 force 时执行）
    if (roundToRemove === season.currentRound) {
      await clearRoundRecords(roundToRemove)
    }
    snapshot = removeRoundFromSchedule(season, roundToRemove, { force })
    if (roundToRemove < walkRound) displayWalkRound = walkRound - 1
  } else {
    snapshot = {
      didRemoveRound: false,
      removeRound: null,
      prevFinal3Round: season.final3Round ?? null,
      prevChampionRound: season.championRound ?? null,
      prevTotalRounds: season.totalRounds ?? null,
      prevCurrentRound: season.currentRound,
      prevCurrentStage: season.currentStage,
      ...snapshotSeasonEndgame(season)
    }
  }

  player.status = 'walked'
  player.walkedAt = new Date().toISOString()
  player.walkedRound = displayWalkRound
  player.walkNote = typeof note === 'string' ? note.trim().slice(0, 500) : ''
  player.walkUndo = snapshot
  player.isHaveNot = false
  player.isMoving = false
  player.moveFromRoomId = null
  player.moveToRoomId = null
  player.moveStartedAt = null
  player.moveEndsAt = null
  player.moveDurationSeconds = null
  player.isSleeping = false
  player.sleepStartedAt = null
  player.wakeAt = null
  player.isShowering = false
  player.showerStartedAt = null
  player.showerCooldownUntil = null
  player.updatedAt = new Date().toISOString()
  await player.save()

  await detachPlayerFromActiveRounds(player.id, displayWalkRound)
  // 先按「退赛前」的终局结构处理人数不足，再清理 season 内的引用
  await reconcileEndgameAfterWalk(season, player)
  detachPlayerFromSeason(season, player.id)

  // 退赛后从 House 中移除
  try {
    const BBPlayerLocation = require('./models/BBPlayerLocation')
    await BBPlayerLocation.deleteMany({ gameId: GAME_ID, playerId: player.id })
    const now = new Date().toISOString()
    await getCollection('BBLocationHistory').updateMany(
      { gameId: GAME_ID, playerId: player.id, to: null },
      { $set: { to: now } }
    )
  } catch (e) { /* ignore */ }

  season.updatedAt = new Date().toISOString()
  await season.save()

  return { player, season, displayWalkRound, snapshot, warnings }
}

/** 撤销退赛：恢复赛程与选手状态 */
async function undoWalk(playerId) {
  const player = await BBHouseguest.findOne({ id: playerId, gameId: GAME_ID })
  if (!player) throw scheduleError('房客不存在', 'NOT_FOUND')
  if (player.status !== 'walked') throw scheduleError('该选手不是退赛状态', 'NOT_WALKED')

  const season = await BBSeason.findOne({ gameId: GAME_ID })
  if (!season) throw scheduleError('赛季不存在', 'NO_SEASON')

  const snap = player.walkUndo
  if (snap) {
    if (snap.didRemoveRound && snap.removeRound) {
      const round = snap.removeRound
      // 后续轮次编号 +1，把被删除的轮次插回去
      season.roundConfigs = (season.roundConfigs || [])
        .map(r => ({ ...r, round: r.round >= round ? r.round + 1 : r.round }))
      if (snap.removedRoundConfig) season.roundConfigs.push(clone(snap.removedRoundConfig))
      season.roundConfigs.sort((a, b) => a.round - b.round)

      season.twistConfigs = (season.twistConfigs || [])
        .map(r => ({ ...r, round: r.round >= round ? r.round + 1 : r.round }))
      if (snap.removedTwistConfig) season.twistConfigs.push(clone(snap.removedTwistConfig))
      season.twistConfigs.sort((a, b) => a.round - b.round)
    }
    season.final3Round = snap.prevFinal3Round ?? season.final3Round
    season.championRound = snap.prevChampionRound ?? season.championRound
    season.totalRounds = snap.prevTotalRounds ?? season.totalRounds
    season.currentRound = snap.prevCurrentRound ?? season.currentRound
    season.currentStage = snap.prevCurrentStage || season.currentStage

    // 恢复终局数据
    season.finalTwo = clone(snap.finalTwo) || season.finalTwo
    season.fhohId = snap.fhohId ?? season.fhohId
    season.fhohName = snap.fhohName || ''
    season.lastJuryId = snap.lastJuryId ?? season.lastJuryId
    season.lastJuryName = snap.lastJuryName || ''
    season.final3Winners = clone(snap.final3Winners) || season.final3Winners
    season.championId = snap.championId ?? season.championId
    season.championName = snap.championName || ''
    season.runnerUpId = snap.runnerUpId ?? season.runnerUpId
    season.runnerUpName = snap.runnerUpName || ''
    season.championReveal = clone(snap.championReveal) || season.championReveal
    season.status = snap.status || season.status
  }

  player.status = 'active'
  player.walkedAt = null
  player.walkedRound = null
  player.walkNote = ''
  player.walkUndo = null
  player.updatedAt = new Date().toISOString()
  await player.save()

  await ensurePlayerLocation(player)

  season.updatedAt = new Date().toISOString()
  await season.save()

  return { player, season }
}

module.exports = {
  GAME_ID,
  lastNormalRoundOf,
  isEndgameSeason,
  removeRoundFromSchedule,
  markWalk,
  undoWalk
}
