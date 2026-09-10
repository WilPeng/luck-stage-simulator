/**
 * 骰子对决 (Dice Duel)
 * 规则：每人3轮，每轮可选投1-4个骰子，点数累计。
 * 最终总分最接近但不超过管理员设定的目标值者获胜；
 * 若所有人都超过目标值，则总分最小者获胜；同分比较完成时间（更早者胜）。
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
  description: '3轮投骰子(每轮1-4个)，总分最接近且不超过目标值者获胜',
  category: 'strategy',
  playerCount: { min: 2, max: 20 },
  duration: 120,

  init(participants) {
    const playerStates = {}
    participants.forEach(p => {
      playerStates[p.playerId] = {
        rounds: [],
        currentRound: 0,
        totalScore: 0,
        finishTime: null
      }
    })
    return { playerStates, status: 'ready' }
  },

  handleAction(state, playerId, action) {
    const ps = state.playerStates[playerId]
    if (!ps) return { updated: false }
    if (!action) return { updated: false }

    if (action.type === 'start') return { updated: true, finished: false }

    if (action.type === 'roll') {
      if (ps.currentRound >= TOTAL_ROUNDS) return { updated: false }

      const diceCount = action.count || 1
      if (diceCount < 1 || diceCount > 4) return { updated: false }

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

      if (ps.currentRound >= TOTAL_ROUNDS) {
        ps.finishTime = Date.now()
        const allFinished = Object.values(state.playerStates).every(
          s => s.currentRound >= TOTAL_ROUNDS
        )
        if (allFinished) {
          return { updated: true, finished: true, winner: this.computeWinner(state), result: { results, total, totalScore: ps.totalScore } }
        }
      }

      return { updated: true, finished: false, result: { results, total, totalScore: ps.totalScore } }
    }

    return { updated: false }
  },

  computeWinner(state) {
    const w = this.getWinners(state)
    return w.length ? w[0] : null
  },

  getWinners(state) {
    const target = Number(state.targetScore)
    const entries = Object.entries(state.playerStates)
    let pool = entries
    if (target && target > 0) {
      const under = entries.filter(([, ps]) => ps.totalScore <= target)
      if (under.length) {
        // 不超过目标：总分最大者（最接近）
        const best = Math.max(...under.map(([, ps]) => ps.totalScore))
        pool = under.filter(([, ps]) => ps.totalScore === best)
      } else {
        // 全部超过：总分最小者
        const min = Math.min(...entries.map(([, ps]) => ps.totalScore))
        pool = entries.filter(([, ps]) => ps.totalScore === min)
      }
    } else {
      const best = Math.max(...entries.map(([, ps]) => ps.totalScore))
      pool = entries.filter(([, ps]) => ps.totalScore === best)
    }
    if (!pool.length) return []
    const earliest = Math.min(...pool.map(([, ps]) => ps.finishTime || Infinity))
    return pool.filter(([, ps]) => (ps.finishTime || Infinity) === earliest).map(([pid]) => pid)
  },

  getState(state, playerId) {
    const ps = state.playerStates[playerId]
    if (!ps) return null
    return {
      rounds: ps.rounds,
      currentRound: ps.currentRound,
      totalRounds: TOTAL_ROUNDS,
      totalScore: ps.totalScore,
      targetScore: Number(state.targetScore) || 0,
      status: state.status
    }
  },

  getAllStates(state) {
    const result = {}
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      const done = ps.currentRound >= TOTAL_ROUNDS
      result[pid] = {
        score: ps.totalScore,
        progress: ps.currentRound,
        max: TOTAL_ROUNDS,
        done,
        label: `第${ps.currentRound}/${TOTAL_ROUNDS}轮 · ${ps.totalScore}分`
      }
    }
    return result
  },

  // 不在达到目标时提前结束（目标只是评分基准）
  checkTarget() { return false }
})
