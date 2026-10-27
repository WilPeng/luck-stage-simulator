/**
 * 德国心脏病 (German Heart / Halli Galli)
 * 规则：
 *  - 每轮桌面翻开一组水果牌；
 *  - 当恰好出现 5 个相同水果时，最快抢铃者 +1 分；
 *  - 没有 5 个相同水果时抢铃视为错误，-3 分（每人每轮只能抢一次）；
 *  - 先达到目标分（默认 5 分）者获胜；
 *  - 或只剩一人得分为正数（其余人均为负分）时，该玩家获胜。
 */
const { registerGame } = require('./index')

const FRUITS = ['🍎', '🍌', '🍇', '🍉', '🍓', '🍒']
const WRONG_PENALTY = 3

function clamp(v, min, max, dflt) {
  const n = parseInt(v, 10)
  if (Number.isNaN(n)) return dflt
  return Math.max(min, Math.min(max, n))
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function analyzeCards(cards) {
  const counts = {}
  for (const f of cards) counts[f] = (counts[f] || 0) + 1
  const fruit = Object.keys(counts).find(f => counts[f] === 5) || null
  return { counts, fruit, valid: !!fruit }
}

// 生成一轮牌：valid=true 时恰好一种水果 5 张；否则任何水果都不足/超过 5 张
function makeCards(total, valid) {
  const counts = {}
  for (const f of FRUITS) counts[f] = 0

  if (valid) {
    const target = FRUITS[Math.floor(Math.random() * FRUITS.length)]
    counts[target] = 5
    let remaining = total - 5
    const others = FRUITS.filter(f => f !== target)
    while (remaining > 0) {
      const candidates = others.filter(f => counts[f] < 4)
      if (!candidates.length) break
      const f = candidates[Math.floor(Math.random() * candidates.length)]
      counts[f] += 1
      remaining -= 1
    }
  } else {
    let remaining = total
    while (remaining > 0) {
      const candidates = FRUITS.filter(f => counts[f] < 4)
      if (!candidates.length) break
      const f = candidates[Math.floor(Math.random() * candidates.length)]
      counts[f] += 1
      remaining -= 1
    }
  }

  const cards = []
  for (const f of FRUITS) {
    for (let i = 0; i < counts[f]; i++) cards.push(f)
  }
  return { cards: shuffle(cards.slice(0, total)), counts }
}

registerGame({
  id: 'german-heart',
  name: '德国心脏病',
  icon: '🔔',
  description: '恰好出现 5 个相同水果时最快抢铃得 1 分，错误抢铃扣 3 分；先到目标分者获胜',
  category: 'reaction',
  playerCount: { min: 2, max: 20 },
  duration: 900,
  needsServerTick: true,
  serverTickMs: 200,
  broadcastState: true,

  init(participants, _pool, options = {}) {
    const opts = {
      targetPoints: clamp(options.targetPoints, 1, 20, 5),
      roundTime: clamp(options.roundTime, 2, 20, 5),
      revealTime: clamp(options.revealTime, 1, 10, 2),
      cardCount: clamp(options.cardCount, 8, 20, 10)
    }
    const scores = {}
    const names = {}
    participants.forEach(p => {
      scores[p.playerId] = 0
      names[p.playerId] = p.playerName || p.playerId
    })
    return {
      status: 'ready',
      started: false,
      finished: false,
      winnerId: null,
      phase: 'live',
      phaseEndsAt: 0,
      round: 0,
      lastValidRound: -2,
      cards: [],
      roundRing: {},
      roundResult: null,
      scores,
      names,
      history: [],
      opts,
      _replayEvents: []
    }
  },

  tick(state) {
    if (state.status !== 'playing' || state.finished) return
    const now = Date.now()
    if (!state.started) {
      state.started = true
      this._startRound(state, now)
      return
    }
    if (now < state.phaseEndsAt) return

    if (state.phase === 'live') {
      this._endRound(state, now, null)
    } else if (state.phase === 'reveal') {
      this._startRound(state, now)
    }
  },

  _startRound(state, now) {
    state.round += 1
    state.roundRing = {}
    state.roundResult = null
    // 有效轮概率约 40%，且不会连续出现有效轮
    const lastWasValid = state.lastValidRound === state.round - 1
    const valid = !lastWasValid && Math.random() < 0.4
    if (valid) state.lastValidRound = state.round
    let cards = makeCards(state.opts.cardCount, valid).cards
    // 安全兜底：确保牌面与预期（有效/无效）一致
    for (let i = 0; i < 5 && analyzeCards(cards).valid !== valid; i++) {
      cards = makeCards(state.opts.cardCount, valid).cards
    }
    state.cards = cards
    state.phase = 'live'
    state.phaseEndsAt = now + state.opts.roundTime * 1000
  },

  _endRound(state, now, winnerId) {
    const info = analyzeCards(state.cards)
    const wrong = Object.keys(state.roundRing).filter(pid => !state.roundRing[pid].correct)
    state.roundResult = {
      round: state.round,
      valid: info.valid,
      fruit: info.fruit,
      counts: info.counts,
      winnerId: winnerId || null,
      wrong
    }
    state.history.push({ ...state.roundResult, at: now })
    this._pushRoundEvent(state, state.roundResult)
    state.phase = 'reveal'
    state.phaseEndsAt = now + state.opts.revealTime * 1000
    this._checkWin(state)
  },

  _pushRoundEvent(state, result) {
    const winnerName = result.winnerId ? state.names[result.winnerId] : ''
    const wrongNames = (result.wrong || []).map(pid => state.names[pid]).filter(Boolean)
    let text = `第${result.round}轮：`
    text += result.valid ? `出现 5 个 ${result.fruit}` : '没有 5 个相同水果'
    if (winnerName) text += `，${winnerName} 抢铃成功 +1`
    if (wrongNames.length) text += `，${wrongNames.join('、')} 错误抢铃 -${WRONG_PENALTY}`
    if (!winnerName && !wrongNames.length) text += '，无人抢铃'
    state._replayEvents.push({
      type: 'round',
      text,
      data: {
        round: result.round,
        valid: result.valid,
        fruit: result.fruit,
        counts: result.counts,
        winnerId: result.winnerId,
        wrong: result.wrong
      }
    })
  },

  _checkWin(state) {
    if (state.finished) return true
    const pids = Object.keys(state.scores)

    const reached = pids.filter(pid => state.scores[pid] >= state.opts.targetPoints)
    if (reached.length) {
      reached.sort((a, b) => state.scores[b] - state.scores[a])
      state.finished = true
      state.winnerId = reached[0]
      return true
    }

    const positives = pids.filter(pid => state.scores[pid] > 0)
    if (positives.length === 1) {
      const only = positives[0]
      const othersAllNegative = pids.every(pid => pid === only || state.scores[pid] < 0)
      if (othersAllNegative) {
        state.finished = true
        state.winnerId = only
        return true
      }
    }
    return false
  },

  handleAction(state, playerId, action) {
    if (!state.scores.hasOwnProperty(playerId)) return { updated: false }
    if (!action || action.type !== 'ring') return { updated: false }
    if (state.finished || state.phase !== 'live') return { updated: false }
    if (state.roundRing[playerId]) return { updated: false, result: { error: '本轮已经抢过铃了' } }

    const now = Date.now()
    if (now > state.phaseEndsAt) return { updated: false }

    const info = analyzeCards(state.cards)

    if (info.valid) {
      state.scores[playerId] += 1
      state.roundRing[playerId] = { at: now, correct: true, points: 1 }
      this._endRound(state, now, playerId)
      const finished = state.finished
      return {
        updated: true,
        finished,
        winner: finished ? state.winnerId : undefined,
        result: { correct: true, fruit: info.fruit, points: 1, score: state.scores[playerId] }
      }
    }

    state.scores[playerId] -= WRONG_PENALTY
    state.roundRing[playerId] = { at: now, correct: false, points: -WRONG_PENALTY }
    this._checkWin(state)

    // 所有人都已抢过铃（且本轮无效）→ 提前结算；若已产生胜者也记录本轮结果
    const allRung = Object.keys(state.roundRing).length >= Object.keys(state.scores).length
    if (state.finished || allRung) {
      this._endRound(state, now, null)
    }

    return {
      updated: true,
      finished: state.finished,
      winner: state.finished ? state.winnerId : undefined,
      result: { correct: false, fruit: info.fruit, points: -WRONG_PENALTY, score: state.scores[playerId] }
    }
  },

  isFinished(state) {
    return state.finished === true
  },

  getWinners(state) {
    if (state.winnerId) return [state.winnerId]
    let best = null
    let bestScore = -Infinity
    for (const [pid, score] of Object.entries(state.scores)) {
      if (score > bestScore) { bestScore = score; best = pid }
    }
    if (!best) return []
    return Object.keys(state.scores).filter(pid => state.scores[pid] === bestScore)
  },

  computeWinner(state) {
    const w = this.getWinners(state)
    return w.length ? w[0] : null
  },

  getState(state, playerId) {
    const pid = playerId || ''
    const now = Date.now()
    const base = {
      status: state.status,
      started: state.started,
      finished: state.finished,
      phase: state.phase,
      round: state.round,
      targetPoints: state.opts.targetPoints,
      roundTime: state.opts.roundTime,
      revealTime: state.opts.revealTime,
      cardCount: state.opts.cardCount,
      cards: state.cards,
      scores: state.scores,
      myScore: state.scores[pid] || 0,
      myRing: state.roundRing[pid] || null,
      ringedCount: Object.keys(state.roundRing).length,
      secondsLeft: Math.max(0, Math.ceil((state.phaseEndsAt - now) / 1000))
    }
    if (state.phase === 'reveal' && state.roundResult) {
      base.roundResult = state.roundResult
    }
    return base
  },

  getAllStates(state) {
    const result = {}
    for (const pid of Object.keys(state.scores)) {
      result[pid] = {
        score: state.scores[pid] || 0,
        progress: Math.max(0, state.scores[pid] || 0),
        max: state.opts.targetPoints,
        done: state.finished,
        label: `${state.scores[pid] || 0} 分`
      }
    }
    return result
  },

  checkTarget(state, playerId, targetScore) {
    if (!targetScore || targetScore <= 0) return false
    return (state.scores[playerId] || 0) >= targetScore
  },

  describeEvent(state, playerId, action, result) {
    if (!action || action.type !== 'ring') return null
    const name = state.names[playerId] || playerId
    const r = result || {}
    if (r.correct) {
      return {
        text: `${name} 抢铃成功 +1${r.fruit ? `（5 个 ${r.fruit}）` : ''}`,
        data: { correct: true, points: 1, fruit: r.fruit }
      }
    }
    return {
      text: `${name} 错误抢铃 -${WRONG_PENALTY}`,
      data: { correct: false, points: -WRONG_PENALTY }
    }
  },

  takeReplayEvents(state) {
    const evs = state._replayEvents || []
    state._replayEvents = []
    return evs
  },

  getReplayMeta(state) {
    return {
      type: 'german-heart',
      targetPoints: state.opts.targetPoints,
      history: state.history || []
    }
  },

  getReplaySnapshot(state) {
    const info = analyzeCards(state.cards)
    const players = {}
    for (const pid of Object.keys(state.scores)) {
      const ring = state.roundRing[pid]
      players[pid] = {
        得分: state.scores[pid] || 0,
        本轮抢铃: ring ? (ring.correct ? '成功 +1' : `错误 -${WRONG_PENALTY}`) : '—'
      }
    }
    return {
      type: 'german-heart',
      round: state.round,
      phase: state.phase,
      cards: state.cards,
      valid: info.valid,
      fruit: info.fruit,
      summary: {
        轮次: state.round,
        阶段: state.phase === 'live' ? '抢铃中' : '结算',
        本轮是否有效: info.valid ? '是' : '否',
        五连水果: info.fruit || '无',
        目标分: state.opts.targetPoints,
        当前牌面: state.cards.join(' ')
      },
      players
    }
  }
})
