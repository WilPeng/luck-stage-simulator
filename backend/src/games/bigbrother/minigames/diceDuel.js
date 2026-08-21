/**
 * 骰子对决 (Dice Duel)
 * 规则：每人3轮，每轮可选投1-3个骰子，点数总和计入总分，3轮后总分最高者获胜
 */
const { registerGame } = require('./index')

const TOTAL_ROUNDS = 3

function rollDice() {
  return Math.floor(Math.random() * 6) + 1
}

registerGame({
  id: 'dice-duel',
  name: '骰子对决',
  icon: '🎲',
  description: '3轮策略性投骰子，每轮选择1-3个骰子，总分最高者获胜',
  category: 'strategy',
  playerCount: { min: 2, max: 20 },
  duration: 90,

  init(participants) {
    const playerStates = {}
    participants.forEach(p => {
      playerStates[p.playerId] = {
        rounds: [],          // [{ diceCount, results, total }]
        currentRound: 0,
        totalScore: 0
      }
    })
    return { playerStates, status: 'ready' }
  },

  handleAction(state, playerId, action) {
    const ps = state.playerStates[playerId]
    if (!ps) return { updated: false }

    if (action.type === 'roll') {
      if (ps.currentRound >= TOTAL_ROUNDS) return { updated: false }

      const diceCount = action.count || 1
      if (diceCount < 1 || diceCount > 3) return { updated: false }

      // 投骰子
      const results = []
      let total = 0
      for (let i = 0; i < diceCount; i++) {
        const val = rollDice()
        results.push(val)
        total += val
      }

      ps.rounds.push({ diceCount, results, total })
      ps.totalScore += total
      ps.currentRound++

      // 检查是否所有人都完成了
      if (ps.currentRound >= TOTAL_ROUNDS) {
        const allFinished = Object.values(state.playerStates).every(
          s => s.currentRound >= TOTAL_ROUNDS
        )
        if (allFinished) {
          return { updated: true, finished: true, winner: this.computeWinner(state), result: { results, total } }
        }
      }

      return { updated: true, finished: false, result: { results, total } }
    }

    return { updated: false }
  },

  computeWinner(state) {
    let maxScore = -1
    let winner = null
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      if (ps.totalScore > maxScore) {
        maxScore = ps.totalScore
        winner = pid
      }
    }
    return winner
  },

  getState(state, playerId) {
    const ps = state.playerStates[playerId]
    if (!ps) return null
    return {
      rounds: ps.rounds,
      currentRound: ps.currentRound,
      totalRounds: TOTAL_ROUNDS,
      totalScore: ps.totalScore,
      status: state.status
    }
  }
})
