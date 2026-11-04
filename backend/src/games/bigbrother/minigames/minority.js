const { registerGame } = require('./index')

/**
 * 少数决 (Minority)
 * 每轮限时15秒，选手对一个无标准答案的二选一问题作答。
 * 结算顺序：
 *  1) 未作答者优先出局；若剩余仅 1 人，该人直接获胜。
 *  2) 剩余 >=2 人时按选项人数判定：
 *     - 平票（1:1 除外）或某选项为 0 人（2:0 除外）→ 本轮不淘汰，继续下一题。
 *     - 不同票型（双方均有人且不相等）→ 人数多的选项一方全部出局。
 *     - 1:1 或 2:0 → 作答手速更快者获胜。
 */
const ROUND_MS = 15000

function optionLabel(question, choice) {
  if (question && Array.isArray(question.options) && question.options[choice] != null) {
    return String(question.options[choice])
  }
  return choice === 0 ? 'A' : 'B'
}

function pushReplay(state, type, text, data) {
  if (!state._replayEvents) state._replayEvents = []
  state._replayEvents.push({ type, text, data: data || null })
}

const DEFAULT_QUESTIONS = [
  { text: '你更喜欢吃甜的还是咸的？', options: ['甜', '咸'] },
  { text: '你更喜欢猫还是狗？', options: ['猫', '狗'] },
  { text: '你更喜欢夏天还是冬天？', options: ['夏天', '冬天'] },
  { text: '你更喜欢海边还是山里？', options: ['海边', '山里'] },
  { text: '你更喜欢早睡还是晚睡？', options: ['早睡', '晚睡'] }
]

// 自定义题库：每轮一道题，两个选项
function normalizeQuestions(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map(item => {
    if (!item || typeof item !== 'object') return null
    const text = String(item.text || '').trim()
    const opts = Array.isArray(item.options)
      ? item.options.map(o => String(o == null ? '' : o).trim())
      : []
    if (!text || opts.length !== 2 || !opts[0] || !opts[1]) return null
    return { text, options: [opts[0], opts[1]] }
  }).filter(Boolean)
}

registerGame({
  id: 'minority',
  name: '少数决',
  icon: '🎭',
  description: '每轮15秒二选一：未作答/多数方出局，平票或某选项无人时不淘汰，1:1 或 2:0 比手速',
  category: 'strategy',
  playerCount: { min: 2, max: 20 },
  duration: 300,
  broadcastState: true,

  init(participants, _pool, options) {
    const playerStates = {}
    participants.forEach(p => {
      playerStates[p.playerId] = { alive: true, eliminatedRound: null, lastTime: null, name: p.playerName || p.playerId }
    })
    const customQuestions = normalizeQuestions(options && options.questions)
    const questions = customQuestions.length ? customQuestions : DEFAULT_QUESTIONS
    return {
      playerStates,
      status: 'ready',
      startTime: null,
      begun: false,
      round: 0,
      roundStartTime: null,
      question: null,
      resolved: false,
      roundAnswers: {},
      lastEliminated: [],
      winner: null,
      finished: false,
      history: [],
      _replayEvents: [],
      questions
    }
  },

  handleAction(state, playerId, action) {
    if (!action) return { updated: false }

    if (action.type === 'start') {
      if (!state.begun) {
        state.begun = true
        if (!state.startTime) state.startTime = Date.now()
        this._startRound(state, 0)
      }
      return { updated: true, finished: false }
    }

    if (state.finished) return { updated: false }

    if (action.type === 'choose') {
      const ps = state.playerStates[playerId]
      if (!ps || !ps.alive) return { updated: false }
      if (!state.roundStartTime) return { updated: false }
      if (state.resolved) return { updated: false }
      if (state.roundAnswers[playerId]) return { updated: false }
      const choice = Number(action.choice)
      if (choice !== 0 && choice !== 1) return { updated: false }
      const time = Date.now() - (state.roundStartTime || Date.now())
      state.roundAnswers[playerId] = { choice, time }
      ps.lastTime = time

      // 所有存活玩家都已作答 → 立即结算
      const alive = Object.entries(state.playerStates).filter(([, p]) => p.alive)
      if (alive.every(([pid]) => state.roundAnswers[pid])) {
        this._resolveRound(state)
        return { updated: true, finished: state.finished, winner: state.winner || undefined }
      }
      return { updated: true, finished: false, result: { choice } }
    }

    if (action.type === 'tick') {
      if (!state.roundStartTime) return { updated: false }
      if (state.resolved) return { updated: false }
      if (Date.now() - (state.roundStartTime || Date.now()) >= ROUND_MS) {
        this._resolveRound(state)
        return { updated: true, finished: state.finished, winner: state.winner || undefined }
      }
      return { updated: false }
    }

    return { updated: false }
  },

  _startRound(state, index) {
    state.round = index
    state.question = state.questions[index % state.questions.length]
    state.roundStartTime = Date.now()
    state.resolved = false
    state.roundAnswers = {}
    state.lastEliminated = []
  },

  _resolveRound(state) {
    state.resolved = true
    const nameOf = pid => (state.playerStates[pid] && state.playerStates[pid].name) || pid
    const alive = Object.entries(state.playerStates).filter(([, p]) => p.alive)
    const eliminated = []

    const eliminate = pid => {
      if (!state.playerStates[pid] || !state.playerStates[pid].alive) return
      state.playerStates[pid].alive = false
      state.playerStates[pid].eliminatedRound = state.round
      eliminated.push(pid)
    }

    // 1) 未作答者优先出局
    const noAns = alive.filter(([pid]) => !state.roundAnswers[pid]).map(([pid]) => pid)
    for (const pid of noAns) eliminate(pid)

    // 剩余已作答且仍存活的玩家
    let remaining = alive
      .filter(([pid]) => state.roundAnswers[pid] && state.playerStates[pid].alive)
      .map(([pid]) => pid)

    const count0 = remaining.filter(pid => state.roundAnswers[pid].choice === 0).length
    const count1 = remaining.length - count0

    // 两人中作答更快者（手速）
    const fasterOf = ids => {
      const sorted = [...ids].sort((a, b) => {
        const ta = state.roundAnswers[a] ? state.roundAnswers[a].time : Number.MAX_SAFE_INTEGER
        const tb = state.roundAnswers[b] ? state.roundAnswers[b].time : Number.MAX_SAFE_INTEGER
        return ta - tb
      })
      return sorted[0]
    }

    let winnerId = null
    let wonBySpeed = false
    let resultType = 'continue'

    if (remaining.length === 0) {
      resultType = 'all-no-answer'
    } else if (remaining.length === 1) {
      // 仅剩 1 人作答 → 直接获胜
      winnerId = remaining[0]
      resultType = 'single-answered-win'
    } else {
      if (count0 === count1) {
        // 平票：1:1 比手速，其余平票（如 2:2）本轮不淘汰
        if (count0 === 1) {
          winnerId = fasterOf(remaining)
          wonBySpeed = true
          resultType = 'fastest-win-1v1'
        } else {
          resultType = 'tie-no-eliminate'
        }
      } else if (count0 === 0 || count1 === 0) {
        // 某选项 0 人：2:0 比手速，其余（如 3:0）本轮不淘汰
        if (remaining.length === 2) {
          winnerId = fasterOf(remaining)
          wonBySpeed = true
          resultType = 'fastest-win-2-0'
        } else {
          resultType = 'zero-no-eliminate'
        }
      } else {
        // 不同票型：人数多的选项一方全部出局
        const majority = count0 > count1 ? 0 : 1
        const majorityIds = remaining.filter(pid => state.roundAnswers[pid].choice === majority)
        for (const pid of majorityIds) eliminate(pid)
        remaining = remaining.filter(pid => state.roundAnswers[pid].choice !== majority)
        if (remaining.length === 1) {
          winnerId = remaining[0]
          resultType = 'majority-eliminated-win'
        } else {
          resultType = 'majority-eliminated-continue'
        }
      }
    }

    // 手速获胜时，其余剩余者出局
    if (winnerId) {
      for (const pid of remaining) {
        if (pid !== winnerId) eliminate(pid)
      }
    }

    state.lastEliminated = eliminated

    const survivors = Object.entries(state.playerStates).filter(([, p]) => p.alive)
    const survivorIds = survivors.map(([pid]) => pid)

    const outcomeText = (() => {
      switch (resultType) {
        case 'all-no-answer': return '全部未作答，比赛结束（无胜者）'
        case 'single-answered-win': return `${nameOf(winnerId)} 是唯一作答者，直接获胜`
        case 'fastest-win-1v1': return `1:1 平票，${nameOf(winnerId)} 作答更快，获胜`
        case 'fastest-win-2-0': return `2:0，${nameOf(winnerId)} 作答更快，获胜`
        case 'tie-no-eliminate': return `平票（${count0}:${count1}），本轮不淘汰，继续下一题`
        case 'zero-no-eliminate': return `某选项 0 人（${count0}:${count1}），本轮不淘汰，继续下一题`
        case 'majority-eliminated-win': return `多数方全部出局，${nameOf(winnerId)} 成为唯一存活者，获胜`
        case 'majority-eliminated-continue': return `多数方全部出局，剩余 ${remaining.length} 人，继续下一题`
        default: return '本轮结束'
      }
    })()

    // 详细复盘记录（每轮完整过程）
    if (!Array.isArray(state.history)) state.history = []
    state.history.push({
      round: state.round + 1,
      question: state.question ? { text: state.question.text, options: [...(state.question.options || [])] } : null,
      counts: [count0, count1],
      noAnswer: [...noAns],
      eliminated: [...eliminated],
      survivors: survivorIds,
      resultType,
      wonBySpeed,
      winnerId: winnerId || null,
      outcomeText,
      participants: alive.map(([pid]) => {
        const a = state.roundAnswers[pid]
        return {
          playerId: pid,
          playerName: nameOf(pid),
          choice: a ? a.choice : null,
          label: a ? optionLabel(state.question, a.choice) : '未作答',
          timeMs: a ? a.time : null,
          noAnswer: !a,
          eliminated: eliminated.includes(pid),
          aliveAfter: !!(state.playerStates[pid] && state.playerStates[pid].alive)
        }
      })
    })

    const choiceText = alive.map(([pid]) => {
      const a = state.roundAnswers[pid]
      return `${nameOf(pid)}:${a ? optionLabel(state.question, a.choice) : '未作答'}`
    }).join('、')
    const elimText = eliminated.length ? eliminated.map(nameOf).join('、') + ' 出局' : '本轮无人出局'
    pushReplay(state, 'round', `第${state.round + 1}轮「${state.question ? state.question.text : ''}」：${choiceText}；${elimText}；${outcomeText}`, {
      round: state.round,
      question: state.question,
      answers: state.roundAnswers,
      counts: [count0, count1],
      noAnswer: noAns,
      eliminated,
      resultType,
      winnerId: winnerId || null
    })

    if (winnerId) {
      state.finished = true
      state.winner = winnerId
      pushReplay(state, 'finish', `${nameOf(winnerId)} ${wonBySpeed ? '作答更快，' : ''}获胜`, { winnerId })
      return
    }

    if (survivors.length === 0) {
      state.finished = true
      state.winner = null
      pushReplay(state, 'finish', '全部出局，无胜者', {})
      return
    }
    if (survivors.length === 1) {
      // 兜底（通常已在 winnerId 分支处理）
      state.finished = true
      state.winner = survivorIds[0]
      pushReplay(state, 'finish', `${nameOf(state.winner)} 获胜`, { winnerId: state.winner })
      return
    }

    // 继续下一轮
    this._startRound(state, state.round + 1)
  },

  getReplayMeta(state) {
    const nameOf = pid => (state.playerStates[pid] && state.playerStates[pid].name) || pid
    return {
      type: 'minority',
      totalRounds: (state.history || []).length,
      rounds: state.history || [],
      winnerId: state.winner || null,
      winnerName: state.winner ? nameOf(state.winner) : '',
      finalAlive: Object.entries(state.playerStates || {})
        .filter(([, p]) => p.alive)
        .map(([pid]) => ({ playerId: pid, playerName: nameOf(pid) }))
    }
  },

  computeWinner(state) {
    return state.winner || null
  },

  getWinners(state) {
    return state.winner ? [state.winner] : []
  },

  getState(state, playerId) {
    const ps = state.playerStates[playerId]
    if (!ps) return null
    const elapsed = state.roundStartTime ? Date.now() - state.roundStartTime : 0
    const myAnswer = state.roundAnswers[playerId] || null
    return {
      round: state.round + 1,
      question: state.question,
      started: !!state.begun,
      roundStartTime: state.roundStartTime,
      timeLeft: Math.max(0, Math.ceil((ROUND_MS - elapsed) / 1000)),
      myChoice: myAnswer ? myAnswer.choice : null,
      myTime: myAnswer ? myAnswer.time : null,
      resolved: state.resolved,
      lastEliminated: state.lastEliminated,
      alivePlayerIds: Object.entries(state.playerStates).filter(([, p]) => p.alive).map(([pid]) => pid),
      alive: !!ps.alive,
      eliminatedRound: ps.eliminatedRound,
      winner: state.winner,
      finished: state.finished,
      status: state.status
    }
  },

  getAllStates(state) {
    const result = {}
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      result[pid] = {
        score: ps.alive ? 1 : 0,
        progress: 0,
        max: 1,
        done: !ps.alive,
        label: ps.alive ? '存活' : `第${ps.eliminatedRound + 1}轮出局`
      }
    }
    return result
  },

  checkTarget() {
    return false
  },

  describeEvent(state, playerId, action, result) {
    const ps = state.playerStates[playerId]
    const name = ps ? ps.name : playerId
    if (action && action.type === 'choose') {
      return { text: `${name} 选择：${optionLabel(state.question, action.choice)}`, data: { choice: action.choice } }
    }
    return null
  },

  takeReplayEvents(state) {
    const evs = state._replayEvents || []
    state._replayEvents = []
    return evs
  }
})
