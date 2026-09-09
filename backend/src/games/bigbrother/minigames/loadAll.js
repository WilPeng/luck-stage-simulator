/**
 * 小游戏加载入口 - 导入此文件即注册所有小游戏
 */
require('./clickSpeed')
require('./memoryMatch')
require('./quickMath')
require('./balanceBar')
require('./diceDuel')

const { getAllGames, getGame, GAME_REGISTRY } = require('./index')
const { loadCustomGame, createCustomGameHandler, getCustomHandlerId, clearCustomGameCache } = require('./customGame')

module.exports = { getAllGames, getGame, GAME_REGISTRY, loadCustomGame, createCustomGameHandler, getCustomHandlerId, clearCustomGameCache }
