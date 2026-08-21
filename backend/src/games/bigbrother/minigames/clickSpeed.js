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
    participants.forEach(p => {
      scores[p.playerId] = 0
      clickTimes[p.playerId] = []
    })
    return { scores, clickTimes, status: 'ready', startTime: null }
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
  }
})
