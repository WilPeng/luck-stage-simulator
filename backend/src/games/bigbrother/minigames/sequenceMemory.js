const { registerGame } = require('./index')

/**
 * 顺序记忆 (Sequence Memory)
 * 每轮按顺序闪动一串 emoji（每个0.3s），数量从4开始每轮递增1~2个。
 * 闪完后随机提问“第N个emoji是什么”，限时20秒，给出3个选项。
 * - 答错或超时：出局
 * - 全部答对：本题作答最慢者出局
 * - 全部答错：最后一个作答者赢得小游戏
 * - 其他：存活到最后一人获胜
 */
const EMOJIS = ['🍎', '🍌', '🍇', '🍓', '🍑', '🍍', '🥝', '🍒', '🍉', '🌽', '🍄', '⭐', '🌙', '🔥', '💧', '🌸', '🍀', '🎈', '🎁', '🧩']
const FLASH_MS = 300
const ANSWER_MS = 20000

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }

function shuffle(a) {
  const arr = a.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

registerGame({
  id: 'sequence-memory',
  name: '顺序记忆',
  icon: '🧠',
  description: '记住emoji闪动顺序并回答第N个，答错出局，存活到最后者胜',
  category: 'memory',
  playerCount: { min: 2, max: 20 },
  duration: 600,
  broadcastState: true,

  init(participants) {
    const playerStates = {}
    participants.forEach(p => {
      playerStates[p.playerId] = { alive: true, eliminatedRound: null }
    })
    return {
      playerStates,
      status: 'ready',
      startTime: null,
      begun: false,
      round: 0,
      seqLen: 4,
      roundStartTime: null,
      flashMs: 0,
      questionStart: null,
      deadline: null,
      sequence: [],
      questionIndex: 0,
      options: [],
      correctEmoji: null,
      roundAnswers: {},
      resolved: false,
      lastEliminated: [],
      winner: null,
      finished: false
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

    if (action.type === 'answer') {
      const ps = state.playerStates[playerId]
      if (!ps || !ps.alive) return { updated: false }
      if (!state.startTime || !state.questionStart) return { updated: false }
      if (state.resolved) return { updated: false }
      if (state.roundAnswers[playerId]) return { updated: false }
      if (Date.now() < state.questionStart) return { updated: false, result: { error: '题目尚未开始' } }
      const time = Date.now() - state.questionStart
      state.roundAnswers[playerId] = { choice: action.choice, time }
      const alive = Object.entries(state.playerStates).filter(([, p]) => p.alive)
      if (alive.every(([pid]) => state.roundAnswers[pid])) {
        this._resolveRound(state)
        return { updated: true, finished: state.finished, winner: state.winner || undefined }
      }
      return { updated: true, finished: false, result: { accepted: true } }
    }

    if (action.type === 'tick') {
      if (!state.deadline) return { updated: false }
      if (state.resolved) return { updated: false }
      if (Date.now() >= state.deadline) {
        this._resolveRound(state)
        return { updated: true, finished: state.finished, winner: state.winner || undefined }
      }
      return { updated: false }
    }

    return { updated: false }
  },

  _startRound(state, index) {
    state.round = index
    if (index === 0) state.seqLen = 4
    else state.seqLen += randInt(1, 2)
    const L = state.seqLen
    state.sequence = Array.from({ length: L }, () => EMOJIS[randInt(0, EMOJIS.length - 1)])
    state.questionIndex = randInt(1, L)
    state.correctEmoji = state.sequence[state.questionIndex - 1]
    // 3个选项：正确 + 2个干扰
    const opts = [state.correctEmoji]
    while (opts.length < 3) {
      const e = EMOJIS[randInt(0, EMOJIS.length - 1)]
      if (!opts.includes(e)) opts.push(e)
    }
    state.options = shuffle(opts)
    state.roundStartTime = Date.now()
    state.flashMs = L * FLASH_MS
    state.questionStart = state.roundStartTime + state.flashMs
    state.deadline = state.questionStart + ANSWER_MS
    state.roundAnswers = {}
    state.resolved = false
    state.lastEliminated = []
  },

  _resolveRound(state) {
    state.resolved = true
    const alive = Object.entries(state.playerStates).filter(([, p]) => p.alive)
    const correctIds = []
    const wrongIds = []
    const noAnsIds = []
    for (const [pid] of alive) {
      const a = state.roundAnswers[pid]
      if (!a) noAnsIds.push(pid)
      else if (a.choice === state.correctEmoji) correctIds.push(pid)
      else wrongIds.push(pid)
    }

    let eliminated = []

    if (correctIds.length === alive.length && alive.length > 1) {
      // 全部答对：最慢者出局
      let slow = correctIds[0]
      for (const pid of correctIds) {
        if (state.roundAnswers[pid].time > state.roundAnswers[slow].time) slow = pid
      }
      eliminated = [slow]
    } else if (correctIds.length === 0 && wrongIds.length === alive.length && alive.length >= 1) {
      // 全部答错：最后一个作答者获胜
      let last = wrongIds[0]
      for (const pid of wrongIds) {
        if (state.roundAnswers[pid].time > state.roundAnswers[last].time) last = pid
      }
      state.finished = true
      state.winner = last
      return
    } else {
      eliminated = [...wrongIds, ...noAnsIds]
    }

    for (const pid of eliminated) {
      state.playerStates[pid].alive = false
      state.playerStates[pid].eliminatedRound = state.round
    }
    state.lastEliminated = eliminated

    const survivors = Object.entries(state.playerStates).filter(([, p]) => p.alive)
    if (survivors.length === 1) {
      state.finished = true
      state.winner = survivors[0][0]
      return
    }
    if (survivors.length === 0) {
      state.finished = true
      state.winner = null
      return
    }
    this._startRound(state, state.round + 1)
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
    const myAnswer = state.roundAnswers[playerId] || null
    return {
      round: state.round + 1,
      seqLen: state.seqLen,
      sequence: state.sequence,
      started: !!state.begun,
      flashStart: state.roundStartTime,
      flashMs: state.flashMs,
      questionStart: state.questionStart,
      deadline: state.deadline,
      timeLeft: Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000)),
      questionIndex: state.questionIndex,
      options: state.options,
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
        label: ps.alive ? `存活 · 第${state.round + 1}轮` : `第${ps.eliminatedRound + 1}轮出局`
      }
    }
    return result
  },

  checkTarget() {
    return false
  }
})
