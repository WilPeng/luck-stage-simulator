const { registerGame } = require('./index')

/**
 * 找不同 (Spot the Difference)
 * 所有选手获得相同的两个 10x10 颜色矩阵，其中有 1-9 处颜色不同。
 * 选手在第二个矩阵点击自己认为不同的格子，点击提交校验；
 * 错误则进入 20 秒冷却（期间隐藏矩阵），冷却结束可继续作答。
 * 第一个找齐并正确的选手获胜。
 */
const SIZE = 10
const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'black', 'white', 'gray', 'pink']
const COOLDOWN = 20000
const TIME_LIMIT = 300000

function randColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)]
}

function generateBoards() {
  const total = SIZE * SIZE
  const gridA = Array.from({ length: total }, () => randColor())
  const gridB = gridA.slice()
  const diffCount = 1 + Math.floor(Math.random() * 9) // 1-9
  const indices = Array.from({ length: total }, (_, i) => i)
  // 随机挑选不同位置
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  const diffs = indices.slice(0, diffCount)
  for (const idx of diffs) {
    let c = randColor()
    while (c === gridA[idx]) c = randColor()
    gridB[idx] = c
  }
  return { gridA, gridB, diffs }
}

registerGame({
  id: 'spot-difference',
  name: '找不同',
  icon: '🔍',
  description: '10x10颜色矩阵找出1-9处不同，第一个找齐者获胜',
  category: 'skill',
  playerCount: { min: 2, max: 20 },
  duration: 300,

  init(participants) {
    const { gridA, gridB, diffs } = generateBoards()
    const playerStates = {}
    const playerNames = {}
    participants.forEach(p => {
      playerStates[p.playerId] = {
        marks: [],            // 已标记的格子索引
        done: false,
        finishTime: null,
        cooldownUntil: 0,
        submissions: []       // 每次提交记录（复盘用）
      }
      playerNames[p.playerId] = p.playerName || p.playerId
    })
    return { playerStates, playerNames, status: 'ready', startTime: null, gridA, gridB, diffs, size: SIZE, colors: COLORS }
  },

  handleAction(state, playerId, action) {
    const ps = state.playerStates[playerId]
    if (!ps) return { updated: false }
    if (!action) return { updated: false }

    if (action.type === 'start') {
      if (!state.startTime) state.startTime = Date.now()
      return { updated: true, finished: false }
    }

    if (ps.done) return { updated: false }

    if (action.type === 'mark') {
      if (Date.now() < ps.cooldownUntil) {
        return { updated: false, result: { error: '冷却中' } }
      }
      const idx = Number(action.index)
      if (!Number.isInteger(idx) || idx < 0 || idx >= SIZE * SIZE) return { updated: false }
      const pos = ps.marks.indexOf(idx)
      if (pos >= 0) ps.marks.splice(pos, 1)
      else ps.marks.push(idx)
      return { updated: true, finished: false, result: { index: idx, marked: pos < 0 } }
    }

    if (action.type === 'submit') {
      if (Date.now() < ps.cooldownUntil) {
        return { updated: false, result: { error: '冷却中' } }
      }
      const marks = ps.marks.slice().sort((a, b) => a - b)
      const diffs = state.diffs.slice().sort((a, b) => a - b)
      const correct = marks.length === diffs.length && marks.every((v, i) => v === diffs[i])
      if (correct) {
        ps.done = true
        ps.finishTime = Date.now()
        ps.submissions.push({ at: ps.finishTime, correct: true, marks: marks.slice(), cooldownUntil: 0 })
        const finished = Object.values(state.playerStates).every(s => s.done)
        return { updated: true, finished, winner: finished ? this.computeWinner(state) : undefined, result: { correct: true } }
      }
      // 错误：进入冷却并清空标记
      ps.marks = []
      ps.cooldownUntil = Date.now() + COOLDOWN
      ps.submissions.push({ at: Date.now(), correct: false, marks: marks.slice(), cooldownUntil: ps.cooldownUntil })
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
      return { started: false, status: state.status }
    }
    const cooling = Date.now() < ps.cooldownUntil
    if (cooling) {
      return {
        started: true,
        hidden: true,
        cooldownRemaining: Math.ceil((ps.cooldownUntil - Date.now()) / 1000),
        wrong: true,
        done: ps.done,
        status: state.status
      }
    }
    return {
      started: true,
      hidden: false,
      size: state.size,
      colors: state.colors,
      gridA: state.gridA,
      gridB: state.gridB,
      marks: ps.marks,
      done: ps.done,
      status: state.status
    }
  },

  getReplayMeta(state) {
    const names = state.playerNames || {}
    const diffInfo = (state.diffs || []).map(idx => ({
      index: idx,
      row: Math.floor(idx / state.size) + 1,
      col: (idx % state.size) + 1,
      colorA: state.gridA[idx],
      colorB: state.gridB[idx]
    }))
    const players = Object.entries(state.playerStates).map(([pid, ps]) => {
      const duration = (state.startTime && ps.finishTime) ? ps.finishTime - state.startTime : null
      return {
        playerId: pid,
        playerName: names[pid] || pid,
        score: ps.done ? state.diffs.length : ps.marks.length,
        status: ps.done ? '已完成' : '未完成',
        details: [
          { label: '找到不同', value: `${ps.done ? state.diffs.length : ps.marks.length}/${state.diffs.length}` },
          { label: '提交次数', value: ps.submissions.length },
          { label: '完成用时', value: duration == null ? '—' : `${(duration / 1000).toFixed(1)}s` }
        ]
      }
    }).sort((a, b) => {
      if ((a.status === '已完成') !== (b.status === '已完成')) return a.status === '已完成' ? -1 : 1
      return b.score - a.score
    })
    const rows = []
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      for (const s of (ps.submissions || [])) {
        rows.push([
          names[pid] || pid,
          s.correct ? '✅ 正确' : '❌ 错误',
          (s.marks || []).map(i => `#${i + 1}`).join('、') || '—',
          state.startTime ? `+${((s.at - state.startTime) / 1000).toFixed(1)}s` : '—'
        ])
      }
    }
    return {
      type: 'spot-difference',
      title: '找不同',
      description: `共 ${state.diffs.length} 处不同，标记所有不同并提交；第一个找齐并正确的选手获胜。`,
      summary: [
        { label: '不同处数', value: state.diffs.length },
        { label: '不同位置', value: diffInfo.map(d => `第${d.row}行第${d.col}列（${d.colorA}→${d.colorB}）`).join('；') }
      ],
      players,
      tables: [{
        title: '提交记录',
        columns: ['选手', '结果', '提交标记', '时间'],
        rows
      }]
    }
  },

  getAllStates(state) {
    const result = {}
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      result[pid] = {
        score: ps.done ? 1 : 0,
        progress: ps.marks.length,
        max: state.diffs.length,
        done: ps.done,
        label: ps.done ? '已找齐' : `已标记 ${ps.marks.length} 处`
      }
    }
    return result
  },

  checkTarget(state, playerId) {
    const ps = state.playerStates[playerId]
    return !!(ps && ps.done)
  }
})
