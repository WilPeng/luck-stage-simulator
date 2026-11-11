/**
 * 快速点击 (Click Speed)
 * 规则：10秒内尽可能多地点击，点击次数最多者获胜
 */
const { registerGame } = require('./index')

registerGame({
  id: 'click-speed',
  name: '快速点击',
  icon: '👆',
  description: '10秒内尽可能多地点击目标区域，点击次数最多者获胜',
  category: 'reaction',
  playerCount: { min: 2, max: 20 },
  duration: 12, // 含倒计时

  init(participants) {
    const scores = {}
    const clickTimes = {} // 防作弊：记录每次点击时间戳
    const scoreHistory = {} // 每秒得分，用于复盘
    const playerNames = {}
    participants.forEach(p => {
      scores[p.playerId] = 0
      clickTimes[p.playerId] = []
      scoreHistory[p.playerId] = []
      playerNames[p.playerId] = p.playerName || p.playerId
    })
    return { scores, clickTimes, scoreHistory, playerNames, status: 'ready', startTime: null }
  },

  handleAction(state, playerId, action) {
    if (!state.scores.hasOwnProperty(playerId)) return { updated: false }

    const now = Date.now()
    const elapsed = state.startTime ? (now - state.startTime) / 1000 : 0
    if (elapsed > 10) return { updated: false, finished: true, winner: this.computeWinner(state) }

    // 防作弊：检查点击频率（每秒不超过20次，防止脚本）
    const times = state.clickTimes[playerId]
    times.push(now)
    // 只保留最近1秒内的点击
    while (times.length > 1 && times[times.length - 1] - times[0] > 1000) {
      times.shift()
    }
    if (times.length > 20) {
      // 疑似作弊，忽略此次点击
      times.pop()
      return { updated: false }
    }

    state.scores[playerId]++
    // 记录每秒得分（同一秒只保留最新分数）
    const sec = Math.max(0, Math.min(10, Math.floor(elapsed)))
    const hist = state.scoreHistory?.[playerId]
    if (hist) {
      if (!hist.length || hist[hist.length - 1].sec !== sec) {
        hist.push({ sec, score: state.scores[playerId] })
      } else {
        hist[hist.length - 1].score = state.scores[playerId]
      }
    }
    return { updated: true, finished: false }
  },

  computeWinner(state) {
    let maxScore = -1
    let winner = null
    for (const [pid, score] of Object.entries(state.scores)) {
      if (score > maxScore) {
        maxScore = score
        winner = pid
      }
    }
    return winner
  },

  getState(state) {
    return { scores: state.scores, status: state.status, startTime: state.startTime }
  },

  getReplayMeta(state) {
    const names = state.playerNames || {}
    const players = Object.entries(state.scores).map(([pid, score]) => {
      const hist = state.scoreHistory?.[pid] || []
      const bySec = {}
      for (const h of hist) bySec[h.sec] = h.score
      const row = []
      let last = 0
      for (let s = 0; s <= 10; s++) {
        if (bySec[s] !== undefined) last = bySec[s]
        row.push(last)
      }
      return {
        playerId: pid,
        playerName: names[pid] || pid,
        score,
        status: '已完成',
        details: [
          { label: '点击次数', value: score },
          { label: '平均每秒', value: (score / 10).toFixed(1) }
        ],
        _row: row
      }
    }).sort((a, b) => b.score - a.score)
    const columns = ['选手', ...Array.from({ length: 11 }, (_, i) => `${i}s`)]
    const rows = players.map(p => [p.playerName, ...p._row])
    for (const p of players) delete p._row
    return {
      type: 'click-speed',
      title: '快速点击',
      description: '10 秒内尽可能多地点击目标区域，点击次数最多者获胜。',
      summary: [{ label: '比赛时长', value: '10 秒' }],
      players,
      tables: [{ title: '每秒累计点击', columns, rows }]
    }
  },

  // 所有玩家的实时进度（管理员观察 + 目标判定）
  getAllStates(state) {
    const result = {}
    for (const [pid, score] of Object.entries(state.scores)) {
      result[pid] = { score, done: false, label: `${score} 次点击` }
    }
    return result
  },

  // 判断某玩家是否达成目标（达到目标分数即胜出）
  checkTarget(state, playerId, targetScore) {
    if (!targetScore || targetScore <= 0) return false
    return (state.scores[playerId] || 0) >= targetScore
  }
})
