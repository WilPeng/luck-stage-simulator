const { registerGame } = require('./index')

/**
 * 华容道 4×4（数字滑块 / 15-Puzzle）
 * 规则：所有选手拿到完全一致的初始棋盘，最快复原（数字 1~15 顺序排列、空格在右下）者获胜。
 * 服务端权威校验每一步移动。
 */

const SIZE = 4
const SOLVED = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0]

function blankIndex(board) {
  return board.indexOf(0)
}

function isAdjacent(board, tileIndex) {
  const b = blankIndex(board)
  const tr = Math.floor(tileIndex / SIZE), tc = tileIndex % SIZE
  const br = Math.floor(b / SIZE), bc = b % SIZE
  return Math.abs(tr - br) + Math.abs(tc - bc) === 1
}

function applyMove(board, tileIndex) {
  const b = blankIndex(board)
  const next = board.slice()
  next[b] = board[tileIndex]
  next[tileIndex] = 0
  return next
}

function isSolved(board) {
  for (let i = 0; i < SOLVED.length; i++) {
    if (board[i] !== SOLVED[i]) return false
  }
  return true
}

// 从复原态随机走合法步打乱，保证有解；所有玩家共用同一初始棋盘
function generateSharedBoard(steps = 120) {
  let board = SOLVED.slice()
  let lastBlank = -1
  for (let i = 0; i < steps; i++) {
    const b = blankIndex(board)
    const br = Math.floor(b / SIZE), bc = b % SIZE
    const candidates = []
    if (br > 0) candidates.push(b - SIZE)
    if (br < SIZE - 1) candidates.push(b + SIZE)
    if (bc > 0) candidates.push(b - 1)
    if (bc < SIZE - 1) candidates.push(b + 1)
    const choices = candidates.filter(idx => idx !== lastBlank)
    const pick = choices[Math.floor(Math.random() * choices.length)]
    lastBlank = b
    board = applyMove(board, pick)
  }
  // 极端情况下避免开局即完成
  if (isSolved(board)) board = applyMove(board, blankIndex(board) === 0 ? 1 : blankIndex(board) - 1)
  return board
}

registerGame({
  id: 'klotski',
  name: '华容道 4×4',
  icon: '🧩',
  description: '所有选手棋盘一致，最快复原数字顺序者获胜',
  category: 'strategy',
  playerCount: { min: 2, max: 20 },
  duration: 300,

  init(participants) {
    const sharedBoard = generateSharedBoard()
    const playerStates = {}
    for (const p of participants) {
      playerStates[p.playerId] = {
        board: sharedBoard.slice(),   // 每人独立棋盘，初始完全一致
        moves: 0,
        startTime: null,
        finishTime: null,
        solved: false
      }
    }
    return { playerStates, initialBoard: sharedBoard.slice(), status: 'ready' }
  },

  handleAction(state, playerId, action) {
    const ps = state.playerStates[playerId]
    if (!ps) return { updated: false }
    if (ps.solved) return { updated: false }
    if (!action || action.type !== 'move') return { updated: false }

    const tileIndex = Number(action.tileIndex)
    if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= SIZE * SIZE) {
      return { updated: false }
    }
    if (!isAdjacent(ps.board, tileIndex)) {
      return { updated: false, result: { error: '只能移动与空格相邻的方块' } }
    }

    if (!ps.startTime) ps.startTime = Date.now()
    ps.board = applyMove(ps.board, tileIndex)
    ps.moves++

    const solved = isSolved(ps.board)
    if (solved) {
      ps.solved = true
      ps.finishTime = Date.now()
      const allDone = Object.values(state.playerStates).every(s => s.solved)
      if (allDone) {
        return { updated: true, finished: true, winner: this.computeWinner(state), result: { solved: true, moves: ps.moves } }
      }
    }

    return { updated: true, finished: false, result: { solved, moves: ps.moves } }
  },

  computeWinner(state) {
    let best = Infinity
    let winner = null
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      if (ps.solved && ps.finishTime && ps.startTime) {
        const duration = ps.finishTime - ps.startTime
        if (duration < best) { best = duration; winner = pid }
      }
    }
    return winner
  },

  getWinners(state) {
    const out = []
    let best = Infinity
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      if (ps.solved && ps.finishTime && ps.startTime) {
        const d = ps.finishTime - ps.startTime
        if (d < best) best = d
      }
    }
    if (best === Infinity) return []
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      if (ps.solved && ps.finishTime && ps.startTime && ps.finishTime - ps.startTime === best) {
        out.push(pid)
      }
    }
    return out
  },

  getState(state, playerId) {
    const ps = state.playerStates[playerId]
    if (!ps) return null
    return {
      board: ps.board,
      size: SIZE,
      moves: ps.moves,
      solved: ps.solved,
      startTime: ps.startTime,
      finishTime: ps.finishTime,
      status: state.status
    }
  },

  getAllStates(state) {
    const result = {}
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      result[pid] = {
        score: ps.moves,
        progress: ps.solved ? 1 : 0,
        max: 1,
        done: ps.solved,
        label: ps.solved ? `已完成（${ps.moves}步）` : `进行中（${ps.moves}步）`
      }
    }
    return result
  },

  // 首位复原者即胜
  checkTarget(state, playerId) {
    const ps = state.playerStates[playerId]
    return !!(ps && ps.solved)
  }
})
