/**
 * Stay or Fold
 * 规则模板：
 *  1) show    展示 emoji 散点图（数量可设定）若干秒，此时不公布目标。
 *  2) estimate 公布目标 emoji，玩家在限时内秘密提交估算（仅 1 次）。
 *  3) reveal  公布每位玩家提交的答案（不公布真实数量、不公布差值）。
 *  4) decide  玩家决定 Stay（继续）或 Fold（本轮退出）。
 *  5) resolve 公布真实数量与所有 Stay 玩家的差值，并结算本轮加分与淘汰。
 *     每轮 Stay 中差值最小者 +1 分；差值最大者被淘汰（若所有 Stay 者同差则不淘汰）。
 *  6) 先达到 targetPoints 分者获胜；或仅剩 1 人时其获胜。
 * 目标 emoji 每轮真实数量可由管理员指定（correctCounts），未指定则随机。
 */
const { registerGame } = require('./index')

const EMOJI = ['🍎', '🍌', '🍇', '🍉', '🍓', '🍒', '🍑', '🥝', '🍍', '🥥', '🍋', '🍊', '🍐', '🫐']

function clamp(v, min, max, dflt) {
  const n = parseInt(v)
  if (Number.isNaN(n)) return dflt
  return Math.max(min, Math.min(max, n))
}

function makePuzzle(size, trueCount) {
  const target = EMOJI[Math.floor(Math.random() * EMOJI.length)]
  const others = EMOJI.filter(e => e !== target)
  const count = Math.max(0, Math.min(size, trueCount))
  const grid = new Array(size)
  for (let i = 0; i < size; i++) grid[i] = others[Math.floor(Math.random() * others.length)]
  const idx = new Set()
  let guard = 0
  while (idx.size < count && guard < size * 10) { idx.add(Math.floor(Math.random() * size)); guard++ }
  for (const i of idx) grid[i] = target
  return { grid, target, trueCount: idx.size }
}

registerGame({
  id: 'stay-or-fold',
  name: 'Stay or Fold',
  icon: '🎯',
  description: '观察 emoji 散点图并估算目标数量，决定 Stay 继续还是 Fold 退出，最先达到目标分者获胜',
  category: 'estimation',
  playerCount: { min: 2, max: 20 },
  duration: 1800,
  needsServerTick: true,
  serverTickMs: 500,
  broadcastState: true,

  init(participants, _pool, options = {}) {
    const opts = {
      showDuration: clamp(options.showDuration, 3, 60, 8),
      answerWindow: clamp(options.answerWindow, 5, 120, 25),
      revealDuration: clamp(options.revealDuration, 3, 60, 8),
      decideDuration: clamp(options.decideDuration, 5, 120, 15),
      resolveDuration: clamp(options.resolveDuration, 3, 60, 8),
      targetPoints: clamp(options.targetPoints, 1, 10, 3),
      gridSize: clamp(options.gridSize, 100, 1600, 400)
    }
    const correctCounts = Array.isArray(options.correctCounts)
      ? options.correctCounts.map(n => parseInt(n, 10)).filter(n => Number.isFinite(n) && n >= 0)
      : []
    const scores = {}
    const alive = []
    participants.forEach(p => { scores[p.playerId] = 0; alive.push(p.playerId) })
    return {
      status: 'ready',
      started: false,
      finished: false,
      winnerId: null,
      phase: 'show',
      phaseEndsAt: 0,
      round: 0,
      grid: [],
      target: '',
      trueCount: 0,
      estimates: {},
      decisions: {},
      scores,
      alive,
      eliminated: [],
      lastResult: null,
      opts,
      correctCounts
    }
  },

  tick(state) {
    if (state.status !== 'playing') return
    const now = Date.now()
    if (!state.started) {
      state.started = true
      this._startRound(state, now)
      return
    }
    if (now < state.phaseEndsAt) return
    if (state.phase === 'show') {
      state.phase = 'estimate'
      state.phaseEndsAt = now + state.opts.answerWindow * 1000
    } else if (state.phase === 'estimate') {
      state.phase = 'reveal'
      state.phaseEndsAt = now + state.opts.revealDuration * 1000
    } else if (state.phase === 'reveal') {
      state.phase = 'decide'
      state.phaseEndsAt = now + state.opts.decideDuration * 1000
    } else if (state.phase === 'decide') {
      this._resolveRound(state)
      state.phase = 'resolve'
      state.phaseEndsAt = now + state.opts.resolveDuration * 1000
    } else if (state.phase === 'resolve') {
      if (state.finished) return
      this._startRound(state, now)
    }
  },

  _startRound(state, now) {
    state.round += 1
    state.estimates = {}
    state.decisions = {}
    const idx = state.round - 1
    let trueCount
    if (state.correctCounts.length) trueCount = state.correctCounts[idx % state.correctCounts.length]
    else trueCount = 3 + Math.floor(Math.random() * 10)
    const { grid, target, trueCount: tc } = makePuzzle(state.opts.gridSize, trueCount)
    state.grid = grid
    state.target = target
    state.trueCount = tc
    state.phase = 'show'
    state.phaseEndsAt = now + state.opts.showDuration * 1000
  },

  _resolveRound(state) {
    const contenders = state.alive.filter(pid => state.decisions[pid] === 'stay' && typeof state.estimates[pid] === 'number')
    const diffs = {}
    let closest = []
    let farthest = []
    if (contenders.length > 0) {
      let minD = Infinity
      let maxD = -Infinity
      for (const pid of contenders) {
        const d = Math.abs(state.estimates[pid] - state.trueCount)
        diffs[pid] = d
        if (d < minD) minD = d
        if (d > maxD) maxD = d
      }
      closest = contenders.filter(pid => diffs[pid] === minD)
      farthest = contenders.filter(pid => diffs[pid] === maxD)
      for (const pid of closest) state.scores[pid] = (state.scores[pid] || 0) + 1
    }
    // 仅当存在“明确落后”的 Stay 者时才淘汰差值最大者
    const willEliminate = farthest.length > 0 && farthest.length < contenders.length
    if (willEliminate) {
      for (const pid of farthest) {
        if (!state.eliminated.includes(pid)) state.eliminated.push(pid)
      }
      state.alive = state.alive.filter(pid => !farthest.includes(pid))
    }
    state.lastResult = {
      round: state.round,
      target: state.target,
      trueCount: state.trueCount,
      estimates: { ...state.estimates },
      decisions: { ...state.decisions },
      diffs,
      closest,
      farthest,
      eliminated: willEliminate ? farthest : []
    }
    // 胜负判定：先达到目标分
    const reached = state.alive.filter(pid => (state.scores[pid] || 0) >= state.opts.targetPoints)
    if (reached.length > 0) {
      // 同轮多人达标时，取本轮差值更小者
      reached.sort((a, b) => (diffs[a] ?? Infinity) - (diffs[b] ?? Infinity))
      state.finished = true
      state.winnerId = reached[0]
    } else if (state.alive.length <= 1) {
      state.finished = true
      state.winnerId = state.alive[0] || null
    }
  },

  handleAction(state, playerId, action) {
    if (!state.scores.hasOwnProperty(playerId)) return { updated: false }
    if (action.type === 'estimate') {
      if (state.phase !== 'estimate') return { updated: false }
      if (state.estimates[playerId] != null) return { updated: false }
      const v = Number(action.value)
      if (!Number.isFinite(v)) return { updated: false }
      state.estimates[playerId] = v
      return { updated: true }
    }
    if (action.type === 'decide') {
      if (state.phase !== 'decide') return { updated: false }
      if (state.decisions[playerId]) return { updated: false }
      state.decisions[playerId] = String(action.value) === 'fold' ? 'fold' : 'stay'
      return { updated: true }
    }
    return { updated: false }
  },

  isFinished(state) {
    return state.finished === true
  },

  getWinners(state) {
    if (state.winnerId) return [state.winnerId]
    let best = null
    let bestScore = -1
    for (const pid of Object.keys(state.scores)) {
      const s = state.scores[pid] || 0
      if (s > bestScore) { bestScore = s; best = pid }
    }
    return best ? [best] : []
  },

  getState(state, playerId) {
    const pid = playerId || ''
    const base = {
      status: state.status,
      started: state.started,
      finished: state.finished,
      phase: state.phase,
      round: state.round,
      targetPoints: state.opts.targetPoints,
      scores: state.scores,
      alive: state.alive,
      eliminated: state.eliminated,
      aliveCount: state.alive.length,
      secondsLeft: Math.max(0, Math.ceil((state.phaseEndsAt - Date.now()) / 1000)),
      myEstimate: state.estimates[pid] != null ? state.estimates[pid] : null,
      myDecision: state.decisions[pid] || null,
      myScore: state.scores[pid] || 0
    }
    if (state.phase === 'show') {
      base.grid = state.grid
    } else {
      base.target = state.target
    }
    // 公布阶段：展示每位玩家的估算
    if (state.phase === 'reveal' || state.phase === 'decide') {
      base.estimates = state.estimates
    }
    // 结算阶段：展示真实数量与差值
    if (state.phase === 'resolve') {
      base.trueCount = state.trueCount
      base.lastResult = state.lastResult
    }
    return base
  },

  getAllStates(state) {
    const result = {}
    for (const pid of Object.keys(state.scores)) {
      result[pid] = { score: state.scores[pid] || 0, done: state.finished, label: `${state.scores[pid] || 0} 分` }
    }
    return result
  },

  describeEvent(state, playerId, action) {
    if (action && action.type === 'estimate') return { text: `提交估算：${action.value}` }
    if (action && action.type === 'decide') return { text: action.value === 'fold' ? '选择 Fold' : '选择 Stay' }
    return null
  }
})
