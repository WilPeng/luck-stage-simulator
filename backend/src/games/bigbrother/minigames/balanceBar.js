/**
 * 保持平衡 (Balance Bar)
 * 规则：指针不断随机摆动，玩家按住空格键将指针保持在中心绿色区域
 * 记录停留在目标区域的总时长，15秒内最长者获胜
 *
 * 服务端模拟指针位置，客户端发送"按住"/"松开"状态
 */
const { registerGame } = require('./index')

const GAME_DURATION = 15000 // 15秒
const TARGET_ZONE = 0.15    // 中心 ±15% 为目标区域
const TICK_INTERVAL = 50    // 50ms 更新一次

registerGame({
  id: 'balance-bar',
  name: '保持平衡',
  icon: '⚖️',
  description: '按住空格键保持指针在中心绿色区域，停留时间最长者获胜',
  category: 'skill',
  playerCount: { min: 2, max: 20 },
  duration: 18, // 含倒计时

  init(participants) {
    const playerStates = {}
    const playerNames = {}
    participants.forEach(p => {
      playerStates[p.playerId] = {
        position: 0.5,       // 0-1，0.5为正中
        velocity: 0,
        isHolding: false,    // 玩家是否按住
        timeInZone: 0,       // 在目标区域的累计毫秒数
        startTime: null,
        history: []          // 每秒采样：{ sec, timeInZone, position }
      }
      playerNames[p.playerId] = p.playerName || p.playerId
    })
    return { playerStates, playerNames, status: 'ready', tickCount: 0 }
  },

  // 服务端 tick 更新（由 socket 层定时调用）
  tick(state) {
    if (state.status !== 'playing') return

    const elapsed = state.startTime ? Date.now() - state.startTime : 0
    if (elapsed >= GAME_DURATION) {
      state.status = 'finished'
      return
    }

    state.tickCount = (state.tickCount || 0) + 1
    for (const pid of Object.keys(state.playerStates)) {
      const ps = state.playerStates[pid]
      // 物理模拟：按住时向中心靠拢，松开时随机摆动
      if (ps.isHolding) {
        // 向中心0.5靠拢
        ps.velocity += (0.5 - ps.position) * 0.08
      } else {
        // 随机漂移
        ps.velocity += (Math.random() - 0.5) * 0.06
      }
      // 阻尼
      ps.velocity *= 0.92
      ps.position += ps.velocity
      // 边界限制
      ps.position = Math.max(0, Math.min(1, ps.position))

      // 检查是否在目标区域
      if (Math.abs(ps.position - 0.5) <= TARGET_ZONE) {
        ps.timeInZone += TICK_INTERVAL
      }
    }

    // 每秒记录一次复盘采样
    if (state.tickCount % 20 === 0) {
      const sec = Math.round(state.tickCount / 20)
      for (const pid of Object.keys(state.playerStates)) {
        const ps = state.playerStates[pid]
        if (!Array.isArray(ps.history)) ps.history = []
        ps.history.push({ sec, timeInZone: ps.timeInZone, position: ps.position })
      }
    }
  },

  handleAction(state, playerId, action) {
    const ps = state.playerStates[playerId]
    if (!ps) return { updated: false }

    if (action.type === 'hold') {
      ps.isHolding = action.holding === true
      if (!ps.startTime) ps.startTime = Date.now()
      return { updated: true, finished: false }
    }

    return { updated: false }
  },

  computeWinner(state) {
    let maxTime = -1
    let winner = null
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      if (ps.timeInZone > maxTime) {
        maxTime = ps.timeInZone
        winner = pid
      }
    }
    return winner
  },

  getState(state, playerId) {
    const ps = state.playerStates[playerId]
    if (!ps) return null
    const elapsed = state.startTime ? Date.now() - state.startTime : 0
    return {
      position: ps.position,
      isHolding: ps.isHolding,
      timeInZone: ps.timeInZone,
      timeLeft: Math.max(0, GAME_DURATION - elapsed),
      status: state.status,
      startTime: state.startTime
    }
  },

  getReplayMeta(state) {
    const names = state.playerNames || {}
    const players = Object.entries(state.playerStates).map(([pid, ps]) => {
      const bySec = {}
      for (const h of (ps.history || [])) bySec[h.sec] = h.timeInZone
      const row = []
      let last = 0
      for (let s = 1; s <= 15; s++) {
        if (bySec[s] !== undefined) last = bySec[s]
        row.push((last / 1000).toFixed(1))
      }
      return {
        playerId: pid,
        playerName: names[pid] || pid,
        score: Math.round(ps.timeInZone),
        status: '已完成',
        details: [
          { label: '停留时间', value: `${(ps.timeInZone / 1000).toFixed(1)}s` },
          { label: '最终位置', value: `${(ps.position * 100).toFixed(0)}%` }
        ],
        _row: row
      }
    }).sort((a, b) => b.score - a.score)
    const columns = ['选手', ...Array.from({ length: 15 }, (_, i) => `${i + 1}s`)]
    const rows = players.map(p => [p.playerName, ...p._row])
    for (const p of players) delete p._row
    return {
      type: 'balance-bar',
      title: '保持平衡',
      description: `按住空格键把指针保持在中心 ±${Math.round(TARGET_ZONE * 100)}% 的绿色区域，累计停留时间最长者获胜。`,
      summary: [{ label: '比赛时长', value: '15 秒' }, { label: '目标区域', value: `中心 ±${Math.round(TARGET_ZONE * 100)}%` }],
      players,
      tables: [{ title: '每秒累计停留（秒）', columns, rows }]
    }
  },

  // 获取所有玩家的汇总状态（用于排名展示）
  getAllStates(state) {
    const result = {}
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      result[pid] = {
        score: ps.timeInZone,
        done: false,
        label: `${(ps.timeInZone / 1000).toFixed(1)}s`
      }
    }
    return result
  },

  // 目标判定：在目标区域累计达到 targetScore（毫秒）即达成
  checkTarget(state, playerId, targetScore) {
    if (!targetScore || targetScore <= 0) return false
    const ps = state.playerStates[playerId]
    if (!ps) return false
    return ps.timeInZone >= targetScore
  },

  TICK_INTERVAL,
  GAME_DURATION
})
