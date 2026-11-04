/**
 * 17 Poker (17扑克)
 *
 * 双人 10 局对战：17 张特殊牌库、切牌、底注、两轮下注、换牌、
 * 摊牌与筹码结算。所有游戏状态均由服务端维护，getState 只返回
 * 当前玩家可见的信息。
 */
const { registerGame } = require('./index')
const engine = require('../../poker17/engine')

registerGame({
  id: 'poker17',
  name: '17 Poker',
  icon: '🃏',
  description: '双人17张特殊牌库，10局对战。初始100筹码，每局底注5，两轮下注与换牌后摊牌比牌型，最终净收益高者获胜。',
  category: 'strategy',
  playerCount: { min: 2, max: 2 },
  duration: 7200,
  needsServerTick: true,
  serverTickMs: 1000,
  broadcastState: true,
  privateActions: ['exchange', 'cut'],

  init(participants, _pool, options = {}) {
    return engine.createMatch(participants, options)
  },

  handleAction(state, playerId, action) {
    return engine.handleAction(state, playerId, action)
  },

  tick(state) {
    return engine.tick(state)
  },

  isFinished(state) {
    return engine.isFinished(state)
  },

  computeWinner(state) {
    return engine.computeWinner(state)
  },

  getWinners(state) {
    return engine.getWinners(state)
  },

  getState(state, playerId) {
    return engine.serializeForPlayer(state, playerId)
  },

  getAllStates(state) {
    return engine.serializeForObserver(state)
  },

  getReplaySnapshot(state) {
    // 复盘/观战快照默认不包含暗牌；仅摊牌时公开双方手牌。
    return engine.serializeReplaySnapshot(state)
  },

  getReplayMeta(state) {
    return engine.serializeMeta(state)
  },

  describeEvent(state, playerId, action) {
    return engine.describeEvent(state, playerId, action)
  },

  takeReplayEvents(state) {
    return engine.takeReplayEvents(state)
  }
})
