/**
 * 小游戏统一接口和注册表
 * 每个小游戏必须实现：
 *   - id, name, description, playerCount, duration
 *   - init(participants): 初始化游戏状态，返回初始状态对象
 *   - handleAction(state, playerId, action): 处理玩家操作，返回 { updated, finished, winner }
 *   - getState(state): 返回当前游戏状态（发送给玩家）
 */

const GAME_REGISTRY = {}

function registerGame(handler) {
  GAME_REGISTRY[handler.id] = handler
}

function getGame(id) {
  return GAME_REGISTRY[id] || null
}

function getAllGames() {
  return Object.values(GAME_REGISTRY).map(g => ({
    id: g.id,
    name: g.name,
    description: g.description,
    icon: g.icon,
    playerCount: g.playerCount,
    duration: g.duration,
    category: g.category
  }))
}

module.exports = { registerGame, getGame, getAllGames, GAME_REGISTRY }
