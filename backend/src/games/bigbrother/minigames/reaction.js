const { registerGame } = require('./index')

/**
 * 反应力 (Reaction)
 * 3x3 共9个板块，每个板块在 (1000, 9999)ms 内的随机时刻变绿。
 * 板块变绿时点击，成绩 = 点击时间 - 变绿时间；提前点击记 5000ms。
 * 9 个板块成绩相加，最小者获胜。
 */
const PANELS = 9
const EARLY_PENALTY = 5000
const TIME_LIMIT = 20000

function randomGreenTimes() {
  return Array.from({ length: PANELS }, () => 1000 + Math.floor(Math.random() * 8999))
}

registerGame({
  id: 'reaction',
  name: '反应力',
  icon: '⚡',
  description: '9个板块随机变绿，变绿后点击，总反应时间最短者获胜',
  category: 'reaction',
  playerCount: { min: 2, max: 20 },
  duration: 20,

  init(participants) {
    const greenTimes = randomGreenTimes()
    const playerStates = {}
    participants.forEach(p => {
      playerStates[p.playerId] = {
        results: new Array(PANELS).fill(null), // null | ms
        finishTime: null,
        done: false
      }
    })
    return { playerStates, status: 'ready', startTime: null, greenTimes }
  },

  handleAction(state, playerId, action) {
    const ps = state.playerStates[playerId]
    if (!ps) return { updated: false }
    if (!action) return { updated: false }

    if (action.type === 'start') {
      if (!state.startTime) state.startTime = Date.now()
      return { updated: true, finished: false }
    }

    if (action.type !== 'click') return { updated: false }
    if (ps.done) return { updated: false }
    if (!state.startTime) state.startTime = Date.now()

    const idx = Number(action.index)
    if (!Number.isInteger(idx) || idx < 0 || idx >= PANELS) return { updated: false }
    if (ps.results[idx] != null) return { updated: false, result: { error: '该板块已结算' } }

    const elapsed = Date.now() - state.startTime
    const green = state.greenTimes[idx]
    let score
    let early = false
    if (elapsed < green) {
      score = EARLY_PENALTY
      early = true
    } else {
      score = elapsed - green
    }
    ps.results[idx] = score

    let finished = false
    if (ps.results.every(r => r != null)) {
      ps.done = true
      ps.finishTime = Date.now()
      finished = Object.values(state.playerStates).every(s => s.done)
    }

    return {
      updated: true,
      finished,
      winner: finished ? this.computeWinner(state) : undefined,
      result: { index: idx, score, early }
    }
  },

  computeWinner(state) {
    const w = this.getWinners(state)
    return w.length ? w[0] : null
  },

  getWinners(state) {
    const entries = Object.entries(state.playerStates)
    const totalOf = (ps) => ps.results.reduce((a, r) => a + (r == null ? EARLY_PENALTY : r), 0)
    let best = Infinity
    for (const [, ps] of entries) best = Math.min(best, totalOf(ps))
    const cands = entries.filter(([, ps]) => totalOf(ps) === best)
    const earliest = Math.min(...cands.map(([, ps]) => ps.finishTime || Infinity))
    return cands.filter(([, ps]) => (ps.finishTime || Infinity) === earliest).map(([pid]) => pid)
  },

  getState(state, playerId) {
    const ps = state.playerStates[playerId]
    if (!ps) return null
    const total = ps.results.reduce((a, r) => a + (r == null ? 0 : r), 0)
    const elapsed = state.startTime ? Date.now() - state.startTime : 0
    return {
      startTime: state.startTime,
      greenTimes: state.greenTimes,
      results: ps.results,
      total,
      done: ps.done,
      earlyPenalty: EARLY_PENALTY,
      timeLeft: Math.max(0, Math.ceil((TIME_LIMIT - elapsed) / 1000)),
      status: state.status
    }
  },

  getAllStates(state) {
    const result = {}
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      const total = ps.results.reduce((a, r) => a + (r == null ? 0 : r), 0)
      result[pid] = {
        score: total,
        progress: ps.results.filter(r => r != null).length,
        max: PANELS,
        done: ps.done,
        label: `${total}ms (${ps.results.filter(r => r != null).length}/${PANELS})`
      }
    }
    return result
  },

  checkTarget() { return false }
})
