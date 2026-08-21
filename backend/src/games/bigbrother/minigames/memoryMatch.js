/**
 * 记忆翻牌 (Memory Match)
 * 规则：4x4共8对卡片，翻牌配对，完成所有配对用时最短者获胜
 * 服务端生成牌面布局，玩家操作由服务端验证
 */
const { registerGame } = require('./index')

// 生成随机牌面布局（返回 16 个值，每对出现2次）
function generateBoard() {
  const emojis = ['🌟', '🔥', '💎', '🎯', '🎨', '🎵', '🌈', '🍀']
  const cards = [...emojis, ...emojis] // 8对
  // Fisher-Yates 洗牌
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

registerGame({
  id: 'memory-match',
  name: '记忆翻牌',
  icon: '🃏',
  description: '翻牌配对，完成4x4所有配对用时最短者获胜',
  category: 'memory',
  playerCount: { min: 2, max: 20 },
  duration: 120,

  init(participants) {
    const playerStates = {}
    participants.forEach(p => {
      playerStates[p.playerId] = {
        board: generateBoard(),
        flipped: [],        // 当前翻开的索引
        matched: [],        // 已配对的索引
        moves: 0,
        startTime: null,
        finishTime: null
      }
    })
    return { playerStates, status: 'ready' }
  },

  handleAction(state, playerId, action) {
    const ps = state.playerStates[playerId]
    if (!ps) return { updated: false }

    // 翻牌操作
    if (action.type === 'flip') {
      const idx = action.index
      if (typeof idx !== 'number' || idx < 0 || idx >= 16) return { updated: false }
      if (ps.matched.includes(idx)) return { updated: false }

      // 记录开始时间
      if (!ps.startTime) ps.startTime = Date.now()

      // 如果已经翻了2张还没匹配，先重置
      if (ps.flipped.length === 2) {
        // 检查是否配对
        const [a, b] = ps.flipped
        if (ps.board[a] === ps.board[b]) {
          ps.matched.push(a, b)
        }
        ps.flipped = []
      }

      // 如果已经匹配完成
      if (ps.matched.length >= 16) {
        ps.finishTime = ps.finishTime || Date.now()
        // 检查是否全部完成
        const allFinished = Object.values(state.playerStates).every(
          s => s.matched.length >= 16
        )
        if (allFinished) {
          return { updated: true, finished: true, winner: this.computeWinner(state) }
        }
        return { updated: false }
      }

      // 不能翻已翻开或已配对的
      if (ps.flipped.includes(idx)) return { updated: false }

      ps.flipped.push(idx)
      ps.moves++

      // 如果刚好翻开第2张，检查配对
      if (ps.flipped.length === 2) {
        const [x, y] = ps.flipped
        if (ps.board[x] === ps.board[y]) {
          ps.matched.push(x, y)
          ps.flipped = []
        }
      }

      // 检查是否完成
      if (ps.matched.length >= 16) {
        ps.finishTime = ps.finishTime || Date.now()
        const allFinished = Object.values(state.playerStates).every(
          s => s.matched.length >= 16
        )
        if (allFinished) {
          return { updated: true, finished: true, winner: this.computeWinner(state) }
        }
      }

      return { updated: true, finished: false }
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
  }
})
