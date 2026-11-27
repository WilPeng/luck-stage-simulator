const { generateId } = require('./helpers')
const { getCollection } = require('../../config/db')
const { enabled, loadRoundTwist } = require('./roundTwists')

const gameId = 'bigbrother'
const branchIds = ['battle_of_block', 'split_house']
const branches = season => branchIds.find(id => enabled(season, id))
const invalid = message => Object.assign(new Error(message), { status: 400 })

function validateIds(ids, size, eligible) {
  if (!Array.isArray(ids) || ids.length !== size || new Set(ids).size !== size || ids.some(id => !eligible.includes(id))) {
    throw invalid(`请选择 ${size} 名不同的合资格房客`)
  }
}

function battleResult(state, action, user, activeIds) {
  const admin = user.role === 'admin'
  if (state?.done) throw invalid('资格对抗已经完成')
  if (action.kind === 'setup' && admin && !state) {
    validateIds(action.ids, 2, activeIds)
    return { hohs: action.ids, nominations: {} }
  }
  if (!state) throw invalid('请先确认两名临时 HOH')
  if (action.kind === 'nominate') {
    const hoh = admin ? action.hoh : user.userId
    if (!state.hohs.includes(hoh) || state.nominations[hoh]) throw invalid('必须由对应的临时 HOH 提名')
    const unavailable = [...state.hohs, ...Object.values(state.nominations).flat()]
    validateIds(action.ids, 2, activeIds.filter(id => !unavailable.includes(id)))
    return { ...state, nominations: { ...state.nominations, [hoh]: action.ids } }
  }
  if (action.kind === 'result' && admin && state.hohs.every(id => state.nominations[id])) {
    if (!state.hohs.includes(action.winner)) throw invalid('请选择胜出的提名组')
    const remainingHoh = state.hohs.find(id => id !== action.winner)
    return { ...state, done: true, safeHoh: action.winner, remainingHoh }
  }
  throw invalid('当前无法执行此操作')
}

function splitResult(state, action, user, activeIds) {
  const admin = user.role === 'admin'
  if (!state && admin && action.kind === 'setup') {
    const size = Math.floor(activeIds.length / 2)
    if (size < 5) throw invalid('分屋需要至少 10 名在场房客')
    validateIds(action.ids, size, activeIds)
    return { groups: [action.ids, activeIds.filter(id => !action.ids.includes(id))].map(ids => ({
      ids, phase: 'hoh', ballots: {}, messages: []
    })) }
  }
  if (!state || state.done) throw invalid('当前没有进行中的分屋')
  if (action.kind === 'merge' && admin && state.groups.every(g => g.phase === 'settled')) return { ...state, done: true }
  const index = admin ? Number(action.group) : state.groups.findIndex(g => g.ids.includes(user.userId))
  const prior = state.groups[index]
  if (!prior) throw invalid('你不在此分组内')
  const group = { ...prior }
  const decider = id => admin || user.userId === id
  if (action.kind === 'message' && group.phase !== 'settled' && !admin) {
    const text = String(action.text || '').trim()
    if (!text || text.length > 500) throw invalid('消息须为 1–500 个字符')
    group.messages = [...group.messages, { id: generateId(), playerId: user.userId, text, at: Date.now() }].slice(-150)
  } else if (group.phase === 'hoh' && admin && action.kind === 'hoh') {
    validateIds([action.target], 1, group.ids)
    group.hoh = action.target
    group.phase = 'nominate'
  } else if (group.phase === 'nominate' && decider(group.hoh) && action.kind === 'nominate') {
    validateIds(action.ids, 2, group.ids.filter(id => id !== group.hoh))
    group.nominees = action.ids
    group.phase = 'pov'
  } else if (group.phase === 'pov' && admin && action.kind === 'pov') {
    validateIds([action.target], 1, group.ids)
    group.pov = action.target
    group.phase = 'pov-decision'
  } else if (group.phase === 'pov-decision' && decider(group.pov) && action.kind === 'pov-decision') {
    if (action.target) {
      validateIds([action.target], 1, group.nominees)
      group.saved = action.target
      group.nominees = group.nominees.filter(id => id !== action.target)
      group.phase = 'replace'
    } else group.phase = 'vote'
  } else if (group.phase === 'replace' && decider(group.hoh) && action.kind === 'replace') {
    validateIds([action.target], 1, group.ids.filter(id => ![group.hoh, group.pov, group.saved, ...group.nominees].includes(id)))
    group.nominees = [...group.nominees, action.target]
    group.phase = 'vote'
  } else if (group.phase === 'vote' && !admin && action.kind === 'vote' && !group.nominees.includes(user.userId)) {
    validateIds([action.target], 1, group.nominees)
    group.ballots = { ...group.ballots, [user.userId]: action.target }
  } else if (group.phase === 'vote' && admin && action.kind === 'settle') {
    const voters = group.ids.filter(id => id !== group.hoh && !group.nominees.includes(id))
    if (!voters.every(id => group.ballots[id])) throw invalid('请等待本组非提名房客投票')
    group.tally = group.nominees.map(id => ({ id, count: voters.filter(voter => group.ballots[voter] === id).length }))
      .sort((a,b) => b.count - a.count)
    group.evicted = group.tally[0].count === group.tally[1].count ? group.ballots[group.hoh] : group.tally[0].id
    if (!group.evicted) throw invalid('平票时须等待本组 HOH 投裁决票')
    group.phase = 'settled'
  } else throw invalid('当前身份或分组阶段无法执行此操作')
  return { ...state, groups: state.groups.map((entry, i) => i === index ? group : entry) }
}

function visibleBranch(id, state, user) {
  if (!state || id !== 'split_house') return state
  const admin = user.role === 'admin'
  return {
    done: !!state.done,
    groups: state.groups.flatMap((group, index) => {
      if (!admin && !state.done && !group.ids.includes(user.userId)) return []
      const { ballots, messages, ...visible } = group
      return [{ ...visible, index, voteCount: Object.keys(ballots).length, myVote: ballots[user.userId], messages: admin || group.ids.includes(user.userId) ? messages : [] }]
    })
  }
}

async function publishBranch(season, id, branch, players) {
  const roundId = `round-${season.currentRound}`
  const filter = { gameId, roundId }
  const name = id => players.find(p => p.id === id)?.name || id
  const now = new Date().toISOString()
  if (id === 'battle_of_block') {
    const winner = branch.remainingHoh
    await getCollection('BBHohRecord').updateOne(filter, {
      $set: { winnerId: winner, winnerName: name(winner), roundIndex: season.currentRound, competitionType: 'battle_of_block', competitionName: '双房主对抗' },
      $setOnInsert: { id: generateId(), createdAt: now }
    }, { upsert: true })
    const nominees = branch.nominations[winner]
    await getCollection('BBNomination').updateOne(filter, {
      $set: { roundIndex: season.currentRound, hohId: winner, hohName: name(winner), nomineeIds: nominees, nomineeNames: nominees.map(name), vetoUsed: false },
      $setOnInsert: { id: generateId(), createdAt: now }
    }, { upsert: true })
    season.currentStage = 'veto_competition'
  } else {
    const activeCount = branch.groups.reduce((sum, group) => sum + group.ids.length, 0)
    for (const [i, group] of branch.groups.entries()) {
      const rank = activeCount - i
      const isJury = rank <= (season.jurySize ?? 7) + (season.finalSize ?? 2)
      await getCollection('BBHouseguest').updateOne({ gameId, id: group.evicted, status: 'active' }, {
        $set: { status: isJury ? 'jury' : 'evicted', updatedAt: now }
      })
      await getCollection('BBEviction').updateOne({ ...filter, evictedId: group.evicted }, {
        $set: { evictedName: name(group.evicted), roundIndex: season.currentRound, isJury,
          voteCount: group.tally.find(t => t.id === group.evicted).count,
          totalVotes: group.tally.reduce((n,t) => n + t.count, 0),
          voteResults: group.tally.map(t => ({ playerId: t.id, playerName: name(t.id), votes: t.count })) },
        $setOnInsert: { id: generateId(), createdAt: now }
      }, { upsert: true })
    }
    season.currentStage = 'eviction'
  }
  season.updatedAt = now
  await season.save()
}

async function branchSettled(season) {
  const id = branches(season)
  if (!id) return true
  return (await loadRoundTwist(season)).branch?.done === true
}

module.exports = { branches, battleResult, splitResult, visibleBranch, publishBranch, branchSettled }
