const { registerGame } = require('./index')

/**
 * 找出遗失的数字 (Missing Number)
 * 7×7 矩阵，共 49 个格子，填入 1-50 中随机 49 个不重复数字，恰好缺少 1 个。
 * 选手在输入框填写认为缺少的数字，只能提交 1 次。
 * 第一个提交正确的选手获胜；若限时内无人答对，则提交数字最接近缺失数字者获胜；
 * 同样接近时，提交时间更早者获胜。
 */
const SIZE = 7
const TOTAL = SIZE * SIZE // 49
const MAX_NUM = 50
const DEFAULT_LIMIT = 120

function buildPuzzle() {
  const nums = Array.from({ length: MAX_NUM }, (_, i) => i + 1) // 1..50
  // 洗牌后取前 49 个作为出现数字，剩下的 1 个为缺失数字
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[nums[i], nums[j]] = [nums[j], nums[i]]
  }
  const present = nums.slice(0, TOTAL)
  const missing = nums[TOTAL]
  // 再打乱放入矩阵
  for (let i = present.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[present[i], present[j]] = [present[j], present[i]]
  }
  return { cells: present, missing }
}

registerGame({
  id: 'missing-number',
  name: '找出遗失的数字',
  icon: '🔢',
  description: '7×7矩阵含1-50中的49个数，找出缺少的那个数；仅可提交1次，最先答对者获胜，否则最接近者获胜',
  category: 'skill',
  playerCount: { min: 1, max: 20 },
  duration: DEFAULT_LIMIT,

  init(participants, pool, options) {
    const { cells, missing } = buildPuzzle()
    const timeLimit = Math.max(10, Number(options && options.timeLimit) || DEFAULT_LIMIT)
    const playerStates = {}
    for (const p of participants) {
      playerStates[p.playerId] = { value: null, correct: false, submittedAt: null, cooldownUntil: 0, attempts: 0 }
    }
    return { playerStates, status: 'ready', startTime: null, cells, missing, size: SIZE, timeLimit }
  },

  handleAction(state, playerId, action) {
    const ps = state.playerStates[playerId]
    if (!ps || !action) return { updated: false }

    if (action.type === 'start') {
      if (!state.startTime) state.startTime = Date.now()
      return { updated: true, finished: false }
    }
    if (ps.correct) return { updated: false, result: { error: '你已答对' } }

    if (action.type === 'submit') {
      const now = Date.now()
      if (ps.cooldownUntil && now < ps.cooldownUntil) {
        return { updated: false, result: { cooldownUntil: ps.cooldownUntil } }
      }
      const v = Number(action.value)
      if (!Number.isFinite(v)) return { updated: false }
      ps.value = v
      ps.submittedAt = now
      ps.attempts = (ps.attempts || 0) + 1
      ps.correct = v === state.missing
      if (ps.correct) {
        ps.cooldownUntil = 0
      } else {
        // 答错：3 秒内不可再作答
        ps.cooldownUntil = now + 3000
      }
      const allCorrect = Object.values(state.playerStates).every(s => s.correct)
      return { updated: true, finished: allCorrect, result: { correct: ps.correct, cooldownUntil: ps.cooldownUntil } }
    }

    return { updated: false }
  },

  computeWinner(state) {
    const w = this.getWinners(state)
    return w.length ? w[0] : null
  },

  getWinners(state) {
    const entries = Object.entries(state.playerStates).filter(([, ps]) => ps.value != null)
    if (!entries.length) return []
    // 1) 最先答对
    const correct = entries.filter(([, ps]) => ps.correct)
    if (correct.length) {
      const earliest = Math.min(...correct.map(([, ps]) => ps.submittedAt || Infinity))
      return correct.filter(([, ps]) => (ps.submittedAt || Infinity) === earliest).map(([pid]) => pid)
    }
    // 2) 最接近缺失数字（并列取更早提交）
    let bestDiff = Infinity
    for (const [, ps] of entries) bestDiff = Math.min(bestDiff, Math.abs(ps.value - state.missing))
    const candidates = entries.filter(([, ps]) => Math.abs(ps.value - state.missing) === bestDiff)
    const earliest = Math.min(...candidates.map(([, ps]) => ps.submittedAt || Infinity))
    return candidates.filter(([, ps]) => (ps.submittedAt || Infinity) === earliest).map(([pid]) => pid)
  },

  getState(state, playerId) {
    const ps = state.playerStates[playerId]
    if (!ps) return null
    if (!state.startTime) return { started: false, status: state.status }
    return {
      started: true,
      status: state.status,
      size: state.size,
      cells: state.cells,
      timeLimit: state.timeLimit,
      submitted: ps.correct,
      myValue: ps.value,
      correct: ps.correct,
      cooldownUntil: ps.cooldownUntil || 0
    }
  },

  getAllStates(state) {
    const result = {}
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      result[pid] = {
        score: ps.correct ? 1 : 0,
        progress: ps.correct ? 1 : 0,
        max: 1,
        done: ps.correct,
        label: ps.correct ? `已答对 ${ps.value}` : (ps.value != null ? `最近提交 ${ps.value}` : '未提交')
      }
    }
    return result
  },

  checkTarget(state, playerId) {
    const ps = state.playerStates[playerId]
    return !!(ps && ps.correct)
  },

  describeEvent(state, playerId, action) {
    if (action && action.type === 'submit') return { text: `提交数字：${action.value}` }
    return null
  },

  getReplayMeta(state) {
    const players = {}
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      players[pid] = { value: ps.value, correct: ps.correct, attempts: ps.attempts || 0, submittedAt: ps.submittedAt }
    }
    return { type: 'missing-number', missing: state.missing, cells: state.cells, players }
  }
})
