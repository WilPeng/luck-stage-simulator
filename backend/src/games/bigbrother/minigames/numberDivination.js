/**
 * 数字占卜术 (Number Divination)
 * 规则：
 *  - 每位玩家持有数字 1-10，每轮同时打出 1 个尚未使用过的数字；
 *  - 打出的数字若未与其他玩家重复，则获得该数字的分数；
 *  - 其中未被重复的最大数字获得双倍分数；
 *  - 在重复数字中，重复次数最多的数字（可能不止一个）对应的所有玩家扣除该数字的分数；
 *  - 所有轮次结束后，最终得分最高且不与其他玩家并列者获胜。
 * 若出现并列第一，则依次比较：最后一轮单轮得分（高者胜）→ 最后一轮提交时间（早者胜）。
 */
const { registerGame } = require('./index')

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function clamp(v, min, max, dflt) {
  const n = parseInt(v, 10)
  if (Number.isNaN(n)) return dflt
  return Math.max(min, Math.min(max, n))
}

function pushReplay(state, type, text, data) {
  if (!state._replayEvents) state._replayEvents = []
  state._replayEvents.push({ type, text, data: data || null })
}

registerGame({
  id: 'number-divination',
  name: '数字占卜术',
  icon: '🔮',
  description: '每人持数字1-10，每轮打出唯一数字；未重复者得分，最大数字双倍，重复最多者扣分',
  category: 'strategy',
  playerCount: { min: 2, max: 20 },
  duration: 600,
  needsServerTick: true,
  serverTickMs: 500,
  broadcastState: true,
  privateActions: ['choose'],

  init(participants, _pool, options = {}) {
    const opts = {
      roundCount: clamp(options.roundCount, 1, NUMBERS.length, NUMBERS.length),
      roundTime: clamp(options.roundTime, 5, 120, 15),
      revealTime: clamp(options.revealTime, 2, 30, 5)
    }
    const scores = {}
    const names = {}
    const used = {}
    participants.forEach(p => {
      scores[p.playerId] = 0
      names[p.playerId] = p.playerName || p.playerId
      used[p.playerId] = []
    })
    return {
      status: 'ready',
      started: false,
      finished: false,
      winnerId: null,
      phase: 'pick',
      phaseEndsAt: 0,
      round: 0,
      totalRounds: opts.roundCount,
      choices: {},
      used,
      scores,
      names,
      lastResult: null,
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

    if (state.phase === 'pick') {
      this._autoFill(state, now)
      this._resolveRound(state, now)
      state.phase = 'reveal'
      state.phaseEndsAt = now + state.opts.revealTime * 1000
    } else if (state.phase === 'reveal') {
      if (state.round >= state.totalRounds) {
        state.finished = true
        return
      }
      this._startRound(state, now)
    }
  },

  handleAction(state, playerId, action) {
    if (!state.scores.hasOwnProperty(playerId)) return { updated: false }
    if (!action || action.type !== 'choose') return { updated: false }
    if (!state.started || state.finished || state.phase !== 'pick') return { updated: false }
    if (state.choices[playerId] != null) {
      return { updated: false, result: { error: '本轮已经打出过数字了' } }
    }

    const number = parseInt(action.number, 10)
    if (!Number.isFinite(number) || number < 1 || number > NUMBERS.length) {
      return { updated: false, result: { error: '请选择 1-10 之间的数字' } }
    }
    const ownUsed = state.used[playerId] || []
    if (ownUsed.includes(number)) {
      return { updated: false, result: { error: '该数字已经使用过，不能重复打出' } }
    }

    const now = Date.now()
    state.choices[playerId] = { number, at: now }

    const pids = Object.keys(state.scores)
    const allChosen = pids.every(pid => state.choices[pid] != null)
    if (allChosen) {
      this._resolveRound(state, now)
      state.phase = 'reveal'
      state.phaseEndsAt = now + state.opts.revealTime * 1000
    }

    return { updated: true, finished: false, result: { allChosen } }
  },

  _startRound(state, now) {
    state.round += 1
    state.choices = {}
    state.lastResult = null
    state.phase = 'pick'
    state.phaseEndsAt = now + state.opts.roundTime * 1000
    pushReplay(state, 'round_start', `第${state.round}轮开始，请选择本轮数字`, {
      round: state.round
    })
  },

  _autoFill(state, now) {
    for (const pid of Object.keys(state.scores)) {
      if (state.choices[pid] != null) continue
      const used = state.used[pid] || []
      const avail = NUMBERS.find(n => !used.includes(n))
      if (avail != null) {
        state.choices[pid] = { number: avail, at: now, auto: true }
      }
    }
  },

  _resolveRound(state, now) {
    const pids = Object.keys(state.scores)
    const choices = {}
    const times = {}
    const auto = []
    for (const pid of pids) {
      const c = state.choices[pid]
      if (!c) continue
      choices[pid] = c.number
      times[pid] = c.at
      if (c.auto) auto.push(pid)
    }

    // 统计每个数字被哪些玩家打出
    const byNumber = new Map()
    for (const [pid, num] of Object.entries(choices)) {
      if (!byNumber.has(num)) byNumber.set(num, [])
      byNumber.get(num).push(pid)
    }
    const counts = {}
    for (const [num, owners] of byNumber.entries()) counts[num] = owners.length

    const uniqueNumbers = [...byNumber.keys()]
      .filter(n => byNumber.get(n).length === 1)
      .sort((a, b) => a - b)
    const maxUnique = uniqueNumbers.length ? uniqueNumbers[uniqueNumbers.length - 1] : null

    // 重复数字中，重复次数最多的数字（可能多个）
    let penaltyNumbers = []
    const dupNumbers = [...byNumber.keys()].filter(n => byNumber.get(n).length >= 2)
    if (dupNumbers.length) {
      const maxRepeat = Math.max(...dupNumbers.map(n => byNumber.get(n).length))
      penaltyNumbers = dupNumbers.filter(n => byNumber.get(n).length === maxRepeat).sort((a, b) => a - b)
    }

    const deltas = {}
    pids.forEach(pid => { deltas[pid] = 0 })

    const uniqueScores = uniqueNumbers.map(num => {
      const pid = byNumber.get(num)[0]
      const doubled = num === maxUnique
      const gain = doubled ? num * 2 : num
      deltas[pid] += gain
      return { number: num, playerId: pid, gain, doubled }
    })

    const penalties = penaltyNumbers.map(num => {
      const owners = byNumber.get(num) || []
      for (const pid of owners) deltas[pid] -= num
      return { number: num, playerIds: owners, loss: num }
    })

    for (const pid of pids) {
      state.scores[pid] = (state.scores[pid] || 0) + (deltas[pid] || 0)
      if (choices[pid] != null && !(state.used[pid] || []).includes(choices[pid])) {
        state.used[pid].push(choices[pid])
      }
    }

    const result = {
      round: state.round,
      choices,
      times,
      auto,
      counts,
      uniqueNumbers,
      maxUnique,
      uniqueScores,
      penaltyNumbers,
      penalties,
      deltas,
      scores: { ...state.scores }
    }
    state.lastResult = result
    state.history.push(result)
    pushReplay(state, 'round', this._resultText(state, result), result)
  },

  _resultText(state, result) {
    const nameOf = pid => (state.names[pid] || pid)
    const parts = Object.entries(result.choices)
      .sort((a, b) => a[1] - b[1])
      .map(([pid, num]) => `${nameOf(pid)}打${num}`)
    const gains = (result.uniqueScores || []).map(u => `${nameOf(u.playerId)} +${u.gain}${u.doubled ? '(双倍)' : ''}`)
    const losses = (result.penalties || []).map(p => `${p.playerIds.map(nameOf).join('、')} -${p.loss}`)
    let text = `第${result.round}轮：${parts.join('、')}`
    if (gains.length) text += `；得分：${gains.join('、')}`
    if (losses.length) text += `；扣分：${losses.join('、')}`
    if (!gains.length && !losses.length) text += '；本轮无人得分'
    return text
  },

  isFinished(state) {
    return state.finished === true
  },

  _topScorers(state) {
    const pids = Object.keys(state.scores)
    if (!pids.length) return []
    const best = Math.max(...pids.map(pid => state.scores[pid] || 0))
    return pids.filter(pid => (state.scores[pid] || 0) === best)
  },

  getWinners(state) {
    const top = this._topScorers(state)
    if (top.length <= 1) return top
    // 并列第一：最后一轮单轮得分高者优先；再比较最后一轮提交更早者
    const last = state.lastResult
    if (last) {
      const sorted = [...top].sort((a, b) => (last.deltas?.[b] || 0) - (last.deltas?.[a] || 0))
      if ((last.deltas?.[sorted[0]] || 0) !== (last.deltas?.[sorted[1]] || 0)) return [sorted[0]]
      const byTime = [...sorted].sort((a, b) => {
        const ta = last.times?.[a] ?? Infinity
        const tb = last.times?.[b] ?? Infinity
        return ta - tb
      })
      return [byTime[0]]
    }
    return [top[0]]
  },

  computeWinner(state) {
    const w = this.getWinners(state)
    return w.length ? w[0] : null
  },

  getState(state, playerId) {
    const pid = playerId || ''
    const now = Date.now()
    const pids = Object.keys(state.scores)
    const ranking = pids
      .map(id => ({ playerId: id, playerName: state.names[id] || id, score: state.scores[id] || 0 }))
      .sort((a, b) => b.score - a.score)
    const base = {
      status: state.status,
      started: state.started,
      finished: state.finished,
      phase: state.phase,
      round: Math.min(state.round, state.totalRounds),
      totalRounds: state.totalRounds,
      scores: state.scores,
      names: state.names,
      ranking,
      myScore: state.scores[pid] || 0,
      myUsed: [...(state.used[pid] || [])],
      myChoice: state.choices[pid] ? state.choices[pid].number : null,
      submittedCount: Object.keys(state.choices).length,
      playerCount: pids.length,
      roundTime: state.opts.roundTime,
      revealTime: state.opts.revealTime,
      secondsLeft: Math.max(0, Math.ceil((state.phaseEndsAt - now) / 1000))
    }
    if (state.phase === 'reveal' && state.lastResult) base.lastResult = state.lastResult
    if (state.finished) base.winnerId = this.computeWinner(state)
    return base
  },

  getAllStates(state) {
    const result = {}
    const maxScore = Math.max(1, ...Object.values(state.scores || {}).map(v => Math.abs(v) || 0))
    for (const pid of Object.keys(state.scores || {})) {
      const score = state.scores[pid] || 0
      result[pid] = {
        score,
        progress: Math.max(0, score),
        max: maxScore,
        done: state.finished === true,
        label: `${score} 分`
      }
    }
    return result
  },

  checkTarget() {
    return false
  },

  describeEvent(state, playerId, action) {
    if (!action || action.type !== 'choose') return null
    const name = state.names[playerId] || playerId
    return { text: `${name} 已锁定本轮数字`, data: { locked: true } }
  },

  getReplayMeta(state) {
    return {
      type: 'number-divination',
      totalRounds: state.totalRounds,
      history: state.history || []
    }
  },

  getReplaySnapshot(state) {
    const players = {}
    for (const pid of Object.keys(state.scores || {})) {
      const choice = state.choices[pid]
      players[pid] = {
        总分: state.scores[pid] || 0,
        本轮选择: choice ? choice.number : '—',
        已用数字: (state.used[pid] || []).join('、') || '—'
      }
    }
    const summary = {
      轮次: `${Math.min(state.round, state.totalRounds)}/${state.totalRounds}`,
      阶段: state.phase === 'pick' ? '选择中' : '结算',
      已提交: `${Object.keys(state.choices).length}/${Object.keys(state.scores || {}).length}`
    }
    if (state.lastResult) {
      summary['上一轮结果'] = this._resultText(state, state.lastResult)
    }
    return {
      type: 'number-divination',
      round: state.round,
      phase: state.phase,
      summary,
      players,
      result: state.lastResult || null
    }
  },

  takeReplayEvents(state) {
    const evs = state._replayEvents || []
    state._replayEvents = []
    return evs
  }
})
