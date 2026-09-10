const { registerGame } = require('./index')

/**
 * 指针摆动 (Swing Pointer)
 * 指针在 0~100 之间持续来回摆动；30 秒内每位选手点击 5 次，
 * 记录每次点击时指针的位置，累计总分最高者获胜；同分比较完成时间（更早者胜）。
 */
const PERIOD = 800           // 一次完整来回 800ms
const TOTAL_CHECKS = 5
const TIME_LIMIT = 30000

// 指针摆动位置 0..1；最中心(0.5)得100分，两侧(0/1)得0分
function pointerScore(startTime, now) {
  const t = ((now - startTime) % PERIOD) / PERIOD
  const pos = t < 0.5 ? t * 2 : (1 - t) * 2
  return Math.round(100 * (1 - Math.abs(pos * 2 - 1)))
}

registerGame({
  id: 'swing-pointer',
  name: '指针摆动',
  icon: '🎯',
  description: '30秒内点击5次，指针到最中心得100分两侧为0，累计最高者获胜',
  category: 'skill',
  playerCount: { min: 2, max: 20 },
  duration: 30,

  init(participants) {
    const playerStates = {}
    participants.forEach(p => {
      playerStates[p.playerId] = { checks: [], score: 0, finishTime: null, done: false }
    })
    return { playerStates, status: 'ready', startTime: null }
  },

  handleAction(state, playerId, action) {
    const ps = state.playerStates[playerId]
    if (!ps) return { updated: false }
    if (!action) return { updated: false }

    if (action.type === 'start') {
      if (!state.startTime) state.startTime = Date.now()
      return { updated: true, finished: false }
    }

    if (action.type !== 'check') return { updated: false }
    if (ps.done) return { updated: false }
    if (!state.startTime) state.startTime = Date.now()
    if (Date.now() - state.startTime > TIME_LIMIT) {
      return { updated: false, result: { error: '时间已到' } }
    }

    const value = pointerScore(state.startTime, Date.now())
    ps.checks.push(value)
    ps.score += value

    let finished = false
    if (ps.checks.length >= TOTAL_CHECKS) {
      ps.done = true
      ps.finishTime = Date.now()
      finished = Object.values(state.playerStates).every(s => s.done)
    }

    return {
      updated: true,
      finished,
      winner: finished ? this.computeWinner(state) : undefined,
      result: { value, score: ps.score, checksLeft: Math.max(0, TOTAL_CHECKS - ps.checks.length) }
    }
  },

  computeWinner(state) {
    const w = this.getWinners(state)
    return w.length ? w[0] : null
  },

  getWinners(state) {
    const entries = Object.entries(state.playerStates)
    let best = -1
    for (const [, ps] of entries) best = Math.max(best, ps.score)
    const cands = entries.filter(([, ps]) => ps.score === best)
    if (!cands.length) return []
    const earliest = Math.min(...cands.map(([, ps]) => ps.finishTime || Infinity))
    return cands.filter(([, ps]) => (ps.finishTime || Infinity) === earliest).map(([pid]) => pid)
  },

  getState(state, playerId) {
    const ps = state.playerStates[playerId]
    if (!ps) return null
    const elapsed = state.startTime ? Date.now() - state.startTime : 0
    return {
      startTime: state.startTime,
      period: PERIOD,
      checks: ps.checks,
      score: ps.score,
      checksLeft: Math.max(0, TOTAL_CHECKS - ps.checks.length),
      done: ps.done,
      timeLeft: Math.max(0, Math.ceil((TIME_LIMIT - elapsed) / 1000)),
      totalTime: TIME_LIMIT,
      status: state.status
    }
  },

  getAllStates(state) {
    const result = {}
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      result[pid] = {
        score: ps.score,
        progress: ps.checks.length,
        max: TOTAL_CHECKS,
        done: ps.done,
        label: `${ps.score}分 (${ps.checks.length}/${TOTAL_CHECKS})`
      }
    }
    return result
  },

  checkTarget() { return false }
})
