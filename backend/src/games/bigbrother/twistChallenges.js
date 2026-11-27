const games = {
  'quick-math': '快速算术',
  'dice-duel': '骰子对决',
  'swing-pointer': '指针摆动',
  'reaction': '反应力'
}

function challengeSlots(ctx) {
  const { season, ids, state, hoh, nomination, players, revival, revivalPool } = ctx
  const slots = []
  const add = (twist, key, title, roster, criteria = {}) => {
    slots.push({ twist, key, title, roster, ...criteria })
  }
  if (season.currentStage === 'nomination' && ids.includes('safety_suite') && hoh && !nomination && !state.safePlayerId) {
    add('safety_suite', 'safety', '安全挑战', players.filter(p => p.id !== hoh.winnerId))
  }
  if (season.currentStage !== 'hoh_competition') return slots
  if (revival && !hoh && !state.revivedId) add(revival, 'revival', '复活争夺', revivalPool)
  const branch = state.branch
  if (ids.includes('battle_of_block')) {
    if (!branch) {
      add('battle_of_block', state.firstBattleHoh ? 'battle-hoh-2' : 'battle-hoh-1',
        state.firstBattleHoh ? '第二位临时 HOH' : '第一位临时 HOH', players.filter(p => p.id !== state.firstBattleHoh))
    } else if (!branch.done && branch.hohs.every(id => branch.nominations[id])) {
      const entrants = Object.values(branch.nominations).flat()
      add('battle_of_block', 'battle-nominees', '提名组对抗', players.filter(p => entrants.includes(p.id)),
        { resolveHoh: winner => branch.hohs.find(id => branch.nominations[id].includes(winner)) })
    }
  }
  if (ids.includes('split_house') && !branch?.done) {
    branch?.groups.forEach((group, index) => {
      if (group.phase !== 'hoh' && group.phase !== 'pov') return
      add('split_house', `split-${index}-${group.phase}`, `第 ${index + 1} 组 · ${group.phase.toUpperCase()}`,
        players.filter(p => group.ids.includes(p.id)), { group: index, phase: group.phase })
    })
  }
  return slots
}

function resultAction(ctx, slot, winner) {
  const { twist, key } = slot
  if (twist === 'split_house') return { branchAction: { kind: slot.phase, group: slot.group, target: winner } }
  if (key === 'battle-hoh-1') return { firstBattleHoh: winner }
  if (key === 'battle-hoh-2') return { branchAction: { kind: 'setup', ids: [ctx.state.firstBattleHoh, winner] } }
  if (key === 'battle-nominees') return { branchAction: { kind: 'result', winner: slot.resolveHoh(winner) } }
  return { target: winner }
}

module.exports = { games, challengeSlots, resultAction }
