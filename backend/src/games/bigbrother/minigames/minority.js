const { registerGame } = require('./index')

/**
 * 少数决 (Minority)
 * 每轮限时15秒，选手对一个无标准答案的二选一问题作答。
 * 多数答案一方全员出局，未作答者全员出局；两方人数相等则不淘汰。
 * 若最后剩2人未出局，比较他们在该题的作答时间，更早者获胜。
 * 其他情况存活到最后一人获胜。
 */
const ROUND_MS = 15000

const DEFAULT_QUESTIONS = [
  { text: '你更喜欢吃甜的还是咸的？', options: ['甜', '咸'] },
  { text: '你更喜欢猫还是狗？', options: ['猫', '狗'] },
  { text: '你更喜欢夏天还是冬天？', options: ['夏天', '冬天'] },
  { text: '你更喜欢海边还是山里？', options: ['海边', '山里'] },
  { text: '你更喜欢早睡还是晚睡？', options: ['早睡', '晚睡'] }
]

registerGame({
  id: 'minority',
  name: '少数决',
  icon: '🎭',
  description: '每轮15秒二选一，多数方与未作答者出局，存活到最后者胜',
  category: 'strategy',
  playerCount: { min: 2, max: 20 },
  duration: 300,
  broadcastState: true,

  init(participants) {
    const playerStates = {}
    participants.forEach(p => {
      playerStates[p.playerId] = { alive: true, eliminatedRound: null, lastTime: null }
    })
    const questions = DEFAULT_QUESTIONS
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
    const alive = Object.entries(state.playerStates).filter(([, p]) => p.alive)
    let count0 = 0, count1 = 0
    for (const [pid] of alive) {
      const a = state.roundAnswers[pid]
      if (!a) continue
      if (a.choice === 0) count0++
      else count1++
    }

    let eliminated = []
    const noAns = alive.filter(([pid]) => !state.roundAnswers[pid]).map(([pid]) => pid)
    if (count0 !== count1) {
      const majority = count0 > count1 ? 0 : 1
      const majorityIds = alive
        .filter(([pid]) => state.roundAnswers[pid] && state.roundAnswers[pid].choice === majority)
        .map(([pid]) => pid)
      // 未作答者先出局，其次多数方
      eliminated = [...noAns, ...majorityIds]
    } else {
      eliminated = noAns
    }

    for (const pid of eliminated) {
      state.playerStates[pid].alive = false
      state.playerStates[pid].eliminatedRound = state.round
    }
    state.lastEliminated = eliminated

    const survivors = Object.entries(state.playerStates).filter(([, p]) => p.alive)

    if (survivors.length === 0) {
      state.finished = true
      state.winner = null
      return
    }
    if (survivors.length === 1) {
      state.finished = true
      state.winner = survivors[0][0]
      return
    }
    if (survivors.length === 2) {
      // 比较两人本轮作答时间，更早者胜；若都没作答则继续下一轮
      const times = survivors.map(([pid]) => ({ pid, t: state.roundAnswers[pid] ? state.roundAnswers[pid].time : null }))
      if (times.every(x => x.t != null)) {
        times.sort((a, b) => a.t - b.t)
        state.finished = true
        state.winner = times[0].pid
        return
      }
      // 无法比较则继续
    }

    // 继续下一轮
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
  }
})
