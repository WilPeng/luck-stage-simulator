const { getGame } = require('./minigames/loadAll')

function isSpectatable(room) {
  return ['countdown', 'playing', 'paused'].includes(room?.status)
}

function buildSpectatorState(room) {
  const handler = room.handler || getGame(room.minigameId)
  const states = room.status !== 'countdown' && room.gameState
    ? handler?.getAllStates?.(room.gameState)
    : null

  // 进度摘要中的自由文本和游戏专属字段可能包含答案或隐藏信息。
  return room.participants.map(({ playerId, playerName, avatar, connected }) => {
    const state = states?.[playerId]
    return {
      playerId,
      playerName,
      avatar,
      connected,
      score: Number.isFinite(state?.score) ? state.score : null,
      progress: Number.isFinite(state?.progress) ? state.progress : null,
      max: Number.isFinite(state?.max) ? state.max : null,
      done: state?.done === true,
      eliminated: state?.eliminated === true || state?.alive === false
    }
  })
}

module.exports = { isSpectatable, buildSpectatorState }
