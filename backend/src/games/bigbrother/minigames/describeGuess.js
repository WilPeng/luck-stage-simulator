/**
 * 描述猜谜 (Describe & Guess)
 * 规则：每轮幕后给出一条主题，选手根据逐条放出的描述猜答案。
 *  - 每题共 M 条描述，每条间隔 K 秒放出。
 *  - 选手可在任意时刻作答，每题仅可作答 1 次。
 *  - 第 1 条描述后答对得 M+1 分；此后每多放一条，答对可得分数 -1。
 *  - 答错或超时未作答得 0 分。
 *  - 共 N 题，总分高者胜；同分则比较所有题目提交耗时之和（ms），用时更少者胜。
 * M / N / K 及题目内容均可通过 options 配置。
 */
const { registerGame } = require('./index')

// 自定义模板：题目内容完全由管理员在创建比赛时提供。
// 未提供时使用占位模板（请勿依赖默认答案）。
const PLACEHOLDER_QUESTIONS = [
  { answer: '示例答案', clues: ['这是占位描述，请在创建比赛时自定义题目与描述'] }
]

function clampInt(v, min, max, dflt) {
  const n = parseInt(v)
  if (Number.isNaN(n)) return dflt
  return Math.max(min, Math.min(max, n))
}

registerGame({
  id: 'describe-guess',
  name: '描述猜谜',
  icon: '💡',
  description: '根据逐条放出的描述，在任意时刻猜出答案；越早答对得分越高',
  category: 'knowledge',
  playerCount: { min: 2, max: 20 },
  duration: 900,
  needsServerTick: true,
  serverTickMs: 500,

  init(participants, _pool, options = {}) {
    const M = clampInt(options.clueCount, 1, 10, 5)
    const N = clampInt(options.questionCount, 1, 30, 7)
    const K = clampInt(options.interval, 3, 120, 15)

    let src = Array.isArray(options.questions) && options.questions.length ? options.questions : PLACEHOLDER_QUESTIONS
    const questions = []
    for (let i = 0; i < N; i++) {
      const q = src[i % src.length] || { answer: '？', clues: [] }
      questions.push({
        answer: String(q.answer || ''),
        clues: (Array.isArray(q.clues) ? q.clues : []).slice(0, M)
      })
    }

    const scores = {}
    const answered = {}
    const submitMs = {}
    const records = {}
    participants.forEach(p => {
      scores[p.playerId] = 0
      answered[p.playerId] = {}
      submitMs[p.playerId] = 0
      records[p.playerId] = {}
    })

    return {
      status: 'ready',
      started: false,
      finished: false,
      M, N, K, questions,
      currentIndex: 0,
      revealedClues: 0,
      questionStartAt: 0,
      nextAt: 0,
      scores, answered, submitMs, records
    }
  },

  tick(state) {
    if (state.status !== 'playing') return
    const now = Date.now()
    if (!state.started) {
      state.started = true
      state.questionStartAt = now
      state.revealedClues = 1
      state.nextAt = now + state.K * 1000
      return
    }
    if (now < state.nextAt) return
    if (state.revealedClues < state.M) {
      state.revealedClues += 1
      state.nextAt = now + state.K * 1000
      return
    }
    // 本题描述已放完，进入下一题
    state.currentIndex += 1
    if (state.currentIndex >= state.N) {
      state.finished = true
      return
    }
    state.revealedClues = 1
    state.questionStartAt = now
    state.nextAt = now + state.K * 1000
  },

  handleAction(state, playerId, action) {
    if (!state.scores.hasOwnProperty(playerId)) return { updated: false }
    if (action.type !== 'answer') return { updated: false }
    if (state.finished) return { updated: false, finished: true }
    const qIndex = state.currentIndex
    if (state.answered[playerId] && state.answered[playerId][qIndex]) return { updated: false }

    const q = state.questions[qIndex]
    const value = String(action.value == null ? '' : action.value).trim()
    const elapsed = Math.max(0, Date.now() - (state.questionStartAt || Date.now()))

    state.answered[playerId] = state.answered[playerId] || {}
    state.answered[playerId][qIndex] = true
    state.submitMs[playerId] = (state.submitMs[playerId] || 0) + elapsed

    let gain = 0
    const correct = value !== '' && value === q.answer
    if (correct) {
      gain = state.M + 1 - (state.revealedClues - 1)
      if (gain < 1) gain = 1
    }
    state.scores[playerId] = (state.scores[playerId] || 0) + gain
    state.records[playerId] = state.records[playerId] || {}
    state.records[playerId][qIndex] = { value, correct, gain }

    return { updated: true }
  },

  isFinished(state) {
    return state.finished === true
  },

  getWinners(state) {
    let best = null
    let bestScore = -1
    let bestTime = Infinity
    for (const pid of Object.keys(state.scores)) {
      const s = state.scores[pid] || 0
      const t = state.submitMs[pid] || 0
      if (s > bestScore || (s === bestScore && t < bestTime)) {
        best = pid
        bestScore = s
        bestTime = t
      }
    }
    return best ? [best] : []
  },

  computeWinner(state) {
    const w = this.getWinners(state)
    return w.length ? w[0] : null
  },

  getState(state, playerId) {
    const q = state.questions[state.currentIndex] || { clues: [] }
    const pid = playerId || ''
    return {
      status: state.status,
      started: state.started,
      finished: state.finished,
      currentIndex: state.currentIndex,
      totalQuestions: state.N,
      clueTotal: state.M,
      revealedClues: state.revealedClues,
      clues: (q.clues || []).slice(0, state.revealedClues),
      answeredThisQuestion: !!(state.answered[pid] && state.answered[pid][state.currentIndex]),
      myScore: state.scores[pid] || 0,
      scores: state.scores,
      interval: state.K,
      nextAt: state.nextAt
    }
  },

  getAllStates(state) {
    const result = {}
    for (const pid of Object.keys(state.scores)) {
      result[pid] = { score: state.scores[pid] || 0, done: state.finished, label: `${state.scores[pid] || 0} 分` }
    }
    return result
  },

  describeEvent(state, playerId, action) {
    if (action && action.type === 'answer') {
      const v = String(action.value == null ? '' : action.value).trim()
      return { text: `作答：${v || '（空）'}` }
    }
    return null
  },

  getReplayMeta(state) {
    const players = {}
    for (const pid of Object.keys(state.scores)) {
      players[pid] = {
        records: state.records[pid] || {},
        score: state.scores[pid] || 0,
        submitMs: state.submitMs[pid] || 0
      }
    }
    return {
      type: 'describe-guess',
      clueCount: state.M,
      questionCount: state.N,
      interval: state.K,
      questions: (state.questions || []).map(q => ({ answer: q.answer, clues: q.clues })),
      players
    }
  }
})
