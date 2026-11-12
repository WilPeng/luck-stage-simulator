/**
 * 已淘汰 / 退赛 / 陪审团选手禁止执行周赛写操作。
 * 仅拦截带 Bearer token 的写请求；无 token 的请求维持原有行为。
 */
const jwt = require('jsonwebtoken')
const BBHouseguest = require('../games/bigbrother/models/BBHouseguest')

const RESTRICTED_STATUSES = ['evicted', 'walked', 'jury']
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

module.exports = function blockRestrictedPlayers(req, res, next) {
  if (!WRITE_METHODS.has(req.method)) return next()

  const authHeader = req.header('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return next()

  let decoded
  try {
    decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET)
  } catch {
    return next()
  }
  if (!decoded?.userId) return next()

  BBHouseguest.findOne({ id: decoded.userId, gameId: 'bigbrother' })
    .then(user => {
      if (user && user.role === 'houseguest' && RESTRICTED_STATUSES.includes(user.status)) {
        return res.status(403).json({
          success: false,
          error: '你已被淘汰或进入陪审团，无法进行该操作',
          code: 'PLAYER_RESTRICTED'
        })
      }
      next()
    })
    .catch(next)
}
