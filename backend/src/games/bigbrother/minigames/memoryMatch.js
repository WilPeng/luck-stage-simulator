/**
 * 记忆翻牌 (Memory Match)
 * 规则：4x4、8 对卡片，翻牌配对，完成所有配对用时最短者获胜
 * 服务端生成牌面布局，玩家操作由服务端校验
 */
const { registerGame } = require('./index')

const TOTAL_CARDS = 16
const TOTAL_PAIRS = 8

// 生成随机牌面布局（返回 16 个值，每对出现 2 次）
function generateBoard() {
  const emojis = ['🌟', '🔥', '💎', '🎯', '🎨', '🎵', '🌈', '🍀']
  const cards = [...emojis, ...emojis]
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

registerGame({
  id: 'memory-match',
  name: '记忆翻牌',
  icon: '🃏',
  description: '翻牌配对，完成 4x4 所有配对用时最短者获胜',
  category: 'memory',
  playerCount: { min: 2, max: 20 },
  duration: 120,

  init(participants) {
    const playerStates = {}
    const playerNames = {}
    participants.forEach(p => {
      playerStates[p.playerId] = {
        board: generateBoard(),
        flipped: [],        // 当前翻开的索引
        matched: [],        // 已配对的索引
        moves: 0,
        startTime: null,
        finishTime: null,
        history: []         // 每次翻牌的两张牌与配对结果（复盘用）
      }
      playerNames[p.playerId] = p.playerName || p.playerId
    })
    return { playerStates, playerNames, status: 'ready' }
  },

  handleAction(state, playerId, action) {
    const ps = state.playerStates[playerId]
    if (!ps || !action) return { updated: false }

    if (action.type === 'flip') {
      const idx = action.index
      if (typeof idx !== 'number' || idx < 0 || idx >= TOTAL_CARDS) return { updated: false }
      if (ps.matched.includes(idx)) return { updated: false }

      if (!ps.startTime) ps.startTime = Date.now()

      // 上一轮两张牌未配对：清空当前翻牌，开始新一轮
      if (ps.flipped.length === 2) ps.flipped = []

      if (ps.matched.length >= TOTAL_CARDS) {
        ps.finishTime = ps.finishTime || Date.now()
        return { updated: false }
      }
      if (ps.flipped.includes(idx)) return { updated: false }

      ps.flipped.push(idx)
      ps.moves++

      let result = { index: idx, card: ps.board[idx] }

      // 翻开第二张：判定是否配对，并记录本轮复盘数据
      if (ps.flipped.length === 2) {
        const [x, y] = ps.flipped
        const cardX = ps.board[x]
        const cardY = ps.board[y]
        const matched = cardX === cardY
        ps.history.push({
          a: x,
          b: y,
          cardA: cardX,
          cardB: cardY,
          matched,
          at: Date.now(),
          moves: ps.moves
        })
        result = { ...result, a: x, b: y, cardA: cardX, cardB: cardY, matched }
        if (matched) {
          ps.matched.push(x, y)
          ps.flipped = []
        }
      }

      if (ps.matched.length >= TOTAL_CARDS) {
        ps.finishTime = ps.finishTime || Date.now()
        const allFinished = Object.values(state.playerStates).every(
          s => s.matched.length >= TOTAL_CARDS
        )
        if (allFinished) {
          return { updated: true, finished: true, winner: this.computeWinner(state), result }
        }
        return { updated: true, finished: false, result }
      }

      return { updated: true, finished: false, result }
    }

    return { updated: false }
  },

  computeWinner(state) {
    let bestTime = Infinity
    let winner = null
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      if (ps.finishTime && ps.startTime) {
        const duration = ps.finishTime - ps.startTime
        if (duration < bestTime) {
          bestTime = duration
          winner = pid
        }
      }
    }
    return winner
  },

  getState(state, playerId) {
    const ps = state.playerStates[playerId]
    if (!ps) return null
    return {
      board: ps.board,
      flipped: ps.flipped,
      matched: ps.matched,
      moves: ps.moves,
      startTime: ps.startTime,
      finishTime: ps.finishTime,
      status: state.status
    }
  },

  // 所有玩家的实时进度
  getAllStates(state) {
    const result = {}
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      const done = ps.matched.length >= TOTAL_CARDS
      result[pid] = {
        score: ps.matched.length / 2,
        progress: ps.matched.length / 2,
        max: TOTAL_PAIRS,
        done,
        label: `配对 ${ps.matched.length / 2}/${TOTAL_PAIRS}`
      }
    }
    return result
  },

  /** 管理员观战：每位选手的牌面、翻牌记录与终局数据 */
  getAdminState(state) {
    if (!state) return null
    const names = state.playerNames || {}
    const players = Object.entries(state.playerStates || {}).map(([pid, ps]) => {
      const done = ps.matched.length >= TOTAL_CARDS
      return {
        playerId: pid,
        playerName: names[pid] || pid,
        board: [...(ps.board || [])],
        flipped: [...(ps.flipped || [])],
        matched: [...(ps.matched || [])],
        moves: ps.moves || 0,
        matchedPairs: Math.floor((ps.matched || []).length / 2),
        totalPairs: TOTAL_PAIRS,
        done,
        startTime: ps.startTime || null,
        finishTime: ps.finishTime || null,
        durationMs: (ps.startTime && ps.finishTime) ? (ps.finishTime - ps.startTime) : null,
        history: (ps.history || []).map(h => ({ ...h }))
      }
    })
    return { type: 'memory-match', status: state.status, players }
  },

  /** 复盘：完整牌面 + 每位选手每一次翻牌 */
  getReplayMeta(state) {
    const board = this.getAdminState(state)
    return {
      type: 'memory-match',
      size: 4,
      totalPairs: TOTAL_PAIRS,
      players: board?.players || []
    }
  },

  describeEvent(state, playerId, action, result) {
    if (!action || action.type !== 'flip') return null
    const idx = Number(action.index)
    const ps = state.playerStates[playerId]
    const card = ps?.board?.[idx] || ''
    if (result && result.matched === true) {
      return {
        text: `翻开 #${result.a + 1} ${result.cardA} 与 #${result.b + 1} ${result.cardB}，配对成功`,
        data: { index: idx, matched: true, a: result.a, b: result.b }
      }
    }
    if (result && result.matched === false) {
      return {
        text: `翻开 #${result.a + 1} ${result.cardA} 与 #${result.b + 1} ${result.cardB}，未配对`,
        data: { index: idx, matched: false, a: result.a, b: result.b }
      }
    }
    return { text: `翻开 #${idx + 1} ${card}`, data: { index: idx, card } }
  },

  // 目标判定：完成全部配对即达成
  checkTarget(state, playerId) {
    const ps = state.playerStates[playerId]
    if (!ps) return false
    return ps.matched.length >= TOTAL_CARDS
  }
})
