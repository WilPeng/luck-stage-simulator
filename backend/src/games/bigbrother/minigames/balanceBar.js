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
    participants.forEach(p => {
      playerStates[p.playerId] = {
        position: 0.5,       // 0-1，0.5为正中
        velocity: 0,
        isHolding: false,    // 玩家是否按住
        timeInZone: 0,       // 在目标区域的累计毫秒数
        startTime: null
      }
    })
    return { playerStates, status: 'ready', tickCount: 0 }
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

  // 获取所有玩家的汇总状态（用于排名展示）
  getAllStates(state) {
    const result = {}
    for (const [pid, ps] of Object.entries(state.playerStates)) {
      result[pid] = {
        timeInZone: ps.timeInZone,
        isHolding: ps.isHolding
      }
    }
    return result
  },

  TICK_INTERVAL,
  GAME_DURATION
})
