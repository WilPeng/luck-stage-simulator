const { registerGame } = require('./index')

/**
 * 拼图 (Jigsaw)
 * 管理员上传一张 1:1 图片，前端按 5×5 切成 25 片。
 * 选手交换拼图块还原原图，点击提交；提交错误锁定 15 秒。
 * 第一个拼对并提交的选手获胜。
 */
const SIZE = 5
const TOTAL = SIZE * SIZE
const COOLDOWN = 15000

function identity() {
  return Array.from({ length: TOTAL }, (_, i) => i)
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
function isSolved(order) {
  return order.every((v, i) => v === i)
}

registerGame({
  id: 'jigsaw',
  name: '拼图',
  icon: '🧩',
  description: '5×5拼图：还原完整图片后提交，第一个拼对者获胜（提交错误锁定15秒）',
  category: 'skill',
  playerCount: { min: 1, max: 20 },
  duration: 600,

  init(participants, pool, options) {
    const imageUrl = (options && options.imageUrl) || ''
    const playerStates = {}
    for (const p of participants) {
      let order = identity()
      do { order = shuffle(identity()) } while (isSolved(order))
      playerStates[p.playerId] = { order, cooldownUntil: 0, done: false, finishTime: null }
    }
    return { playerStates, status: 'ready', startTime: null, size: SIZE, imageUrl }
  },

  handleAction(state, playerId, action) {
    const ps = state.playerStates[playerId]
    if (!ps || !action) return { updated: false }

    if (action.type === 'start') {
      if (!state.startTime) state.startTime = Date.now()
      return { updated: true, finished: false }
    }
    if (ps.done) return { updated: false }
    if (Date.now() < ps.cooldownUntil) {
      return { updated: false, result: { error: '冷却中', cooldownRemaining: Math.ceil((ps.cooldownUntil - Date.now()) / 1000) } }
    }

    if (action.type === 'swap') {
      const a = Number(action.a)
      const b = Number(action.b)
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= TOTAL || b >= TOTAL || a === b) {
        return { updated: false }
      }
      const t = ps.order[a]
      ps.order[a] = ps.order[b]
      ps.order[b] = t
      return { updated: true, finished: false, result: { a, b } }
    }

    if (action.type === 'submit') {
      if (isSolved(ps.order)) {
        ps.done = true
        ps.finishTime = Date.now()
        return { updated: true, finished: true, result: { correct: true } }
      }
      ps.cooldownUntil = Date.now() + COOLDOWN
      return { updated: true, finished: false, result: { correct: false, cooldownMs: COOLDOWN } }
    }

    return { updated: false }
  },

  computeWinner(state) {
    const w = this.getWinners(state)
    return w.length ? w[0] : null
  },

  getWinners(state) {
    const done = Object.entries(state.playerStates).filter(([, ps]) => ps.done)
    if (!done.length) return []
    const earliest = Math.min(...done.map(([, ps]) => ps.finishTime || Infinity))
    return done.filter(([, ps]) => (ps.finishTime || Infinity) === earliest).map(([pid]) => pid)
  },

  getState(state, playerId) {
    const ps = state.playerStates[playerId]
    if (!ps) return null
    if (!state.startTime) {
      return { started: false, status: state.status, size: state.size, imageUrl: state.imageUrl }
    }
    const cooling = Date.now() < ps.cooldownUntil
    return {
      started: true,
      status: state.status,
      size: state.size,
      imageUrl: state.imageUrl,
      order: ps.order,
      done: ps.done,
      wrong: cooling,
      cooldownRemaining: cooling ? Math.ceil((ps.cooldownUntil - Date.now()) / 1000) : 0
    }
  },

  getAllStates(state) {
    const result = {}
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      const placed = ps.order.filter((v, i) => v === i).length
      result[pid] = {
        score: ps.done ? 1 : 0,
        progress: placed,
        max: TOTAL,
        done: ps.done,
        label: ps.done ? '已完成' : `正确 ${placed}/${TOTAL}`
      }
    }
    return result
  },

  checkTarget(state, playerId) {
    const ps = state.playerStates[playerId]
    return !!(ps && ps.done)
  },

  describeEvent(state, playerId, action, result) {
    if (!action) return null
    if (action.type === 'swap') return { text: `交换拼图块 #${action.a} ↔ #${action.b}` }
    if (action.type === 'submit') return { text: (result && result.correct) ? '提交成功，拼图完成！' : '提交错误，锁定15秒' }
    return null
  }
})
