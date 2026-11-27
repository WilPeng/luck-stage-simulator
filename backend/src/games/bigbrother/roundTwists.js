const { getCollection } = require('../../config/db')
const { hasTwist, BB_STAGE_ORDER } = require('./helpers')

const gameId = 'bigbrother'

function enabled(season, id, round = season.currentRound) {
  return hasTwist(round, id, season.twistConfigs, season.roundConfigs)
}

function key(season, round = season.currentRound) {
  return { _id: `${season.id}:${round}` }
}

async function loadRoundTwist(season, round = season.currentRound) {
  return (await getCollection('BBRoundTwist').findOne(key(season, round))) || {}
}

async function writeRoundTwist(season, fields, conditions = {}) {
  try {
    const result = await getCollection('BBRoundTwist').updateOne({ ...key(season), ...conditions }, {
      $set: { ...fields, gameId, round: season.currentRound, seasonId: season.id }
    }, { upsert: true })
    return result.matchedCount + result.upsertedCount > 0
  } catch (error) {
    if (error.code === 11000 && Object.keys(conditions).length) return false
    throw error
  }
}

function nominationCount(season) {
  return ['save_vote', 'tie_recall'].some(id => enabled(season, id)) ? 3 : 2
}

async function checkNominationChoices(season, ids) {
  const safety = enabled(season, 'safety_suite')
  const reserve = enabled(season, 'sealed_replacement')
  const voluntary = enabled(season, 'voluntary_nominee')
  if (!safety && !reserve && !voluntary && !enabled(season, 'save_vote') && !enabled(season, 'tie_recall')) return null
  if (new Set(ids).size !== ids.length || ids.length !== nominationCount(season)) {
    return `本轮须提名 ${nominationCount(season)} 名不同房客`
  }
  const round = await loadRoundTwist(season)
  if (voluntary && round.volunteers?.length && (!round.volunteerId || !ids.includes(round.volunteerId))) return '请选择一位自荐者加入正式提名名单'
  if (safety && !round.safePlayerId) return '请先确认安全挑战结果'
  if (safety && ids.includes(round.safePlayerId)) return '安全挑战胜者本轮免提名'
  if (reserve && (round.reserveIds?.length !== 2 || ids.some(id => round.reserveIds.includes(id)))) {
    return '请先锁定两名候补，正式提名须与候补不同'
  }
  return null
}

async function replacementChoice(season, nomination, veto) {
  if (!enabled(season, 'sealed_replacement') || !veto?.used || !nomination?.vetoUsed) return null
  const round = await loadRoundTwist(season)
  const blocked = new Set([
    ...(nomination.nomineeIds || []), nomination.hohId, veto.winnerId, veto.usedOnPlayerId,
    ...(enabled(season, 'safety_suite') ? [round.safePlayerId] : [])
  ])
  const ids = (round.reserveIds || []).filter(id => !blocked.has(id))
  const players = await getCollection('BBHouseguest').find({
    gameId, role: 'houseguest', status: 'active', id: { $in: ids }
  }).toArray()
  return ids.map(id => players.find(p => p.id === id)).find(Boolean) || null
}

async function earnedVetoSeat(season) {
  const last = season.currentRound - 1
  if (last < 1 || !enabled(season, 'rescue_contract', last)) return null
  const prior = await loadRoundTwist(season, last)
  const veto = await getCollection('BBVetoRecord').findOne({ gameId, roundId: `round-${last}` })
  return veto?.used && prior.contract?.accepted && prior.contract.ids.includes(veto.winnerId)
    && prior.contract.ids.includes(veto.usedOnPlayerId) && veto.winnerId !== veto.usedOnPlayerId
    ? veto.winnerId : null
}

async function vetoRetryPlayer(season) {
  if (!enabled(season, 'voluntary_nominee') && !enabled(season, 'nomination_appeal')) return null
  const state = await loadRoundTwist(season)
  if (enabled(season, 'voluntary_nominee')) return state.volunteerId || null
  return state.appeal?.status === 'resolved' && state.appeal.winnerId === state.appeal.playerId ? state.appeal.playerId : null
}

function incompatibleTwists(ids) {
  const branch = ids.find(id => id === 'split_house' || id === 'battle_of_block')
  if (branch && ids.some(id => id !== branch)) return [branch, ids.find(id => id !== branch)]
  if (ids.includes('round_rewind') && ids.some(id => id !== 'round_rewind')) {
    return ['round_rewind', ids.find(id => id !== 'round_rewind')]
  }
  const conflictPairs = [
    ...['voluntary_nominee', 'nomination_appeal'].flatMap(id => ['no_pendant_challenge','triple_offering','bbbb','save_vote','tie_recall','direct_democracy'].map(other => [id, other])),
    ['voluntary_nominee','nomination_appeal'], ['voluntary_nominee','safety_suite'],
    ['battle_back','costly_return'], ['battle_back','save_vote'], ['battle_back','triple_offering'],
    ['costly_return','save_vote'], ['costly_return','triple_offering'],
    ['costly_return','karmic_pawnship'], ['costly_return','serpent_mark'],
    ['coup_detat','bbbb'], ['coup_detat','sealed_replacement'], ['coup_detat','tie_recall'],
    ['tie_recall','bbbb'], ['tie_recall','save_vote'], ['tie_recall','triple_offering'],
    ['tie_recall','direct_democracy'], ['tie_recall','sealed_replacement'],
    ['save_vote', 'bbbb'], ['save_vote', 'triple_offering'], ['save_vote', 'direct_democracy'],
    ['sealed_replacement', 'direct_democracy'], ['sealed_replacement', 'boomerang_pendant'],
    ['sealed_replacement', 'triple_offering'], ['sealed_replacement', 'bbbb'], ['sealed_replacement', 'save_vote'],
    ['safety_suite', 'direct_democracy'], ['safety_suite', 'bbbb'], ['safety_suite', 'triple_offering'],
    ['veto_trustee', 'no_pendant_challenge'], ['veto_trustee', 'boomerang_pendant'],
    ['sealed_replacement', 'no_pendant_challenge'], ['rescue_contract', 'no_pendant_challenge'], ['rescue_contract', 'boomerang_pendant']
  ]
  return conflictPairs.find(pair => pair.every(id => ids.includes(id))) || null
}

function twistStageStatus(season, round, definition) {
  if (round < season.currentRound) return 'completed'
  if (round > season.currentRound) return 'future'
  const current = BB_STAGE_ORDER.indexOf(season.currentStage)
  if (current < 0) return 'completed'
  const stages = definition.affectsStages.map(stage => BB_STAGE_ORDER.indexOf(stage)).filter(index => index >= 0)
  if (current < Math.min(...stages)) return 'future'
  if (current > Math.max(...stages)) return 'completed'
  return 'current'
}

function isRevivalEligible(id, status) {
  return status === 'evicted' && ['battle_back','costly_return'].includes(id)
    || status === 'jury' && id === 'battle_back'
}

module.exports = {
  enabled, loadRoundTwist, writeRoundTwist, checkNominationChoices, replacementChoice, earnedVetoSeat, vetoRetryPlayer, incompatibleTwists, twistStageStatus, isRevivalEligible
}
