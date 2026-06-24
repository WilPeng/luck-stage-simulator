const jwt = require('jsonwebtoken')

const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: '未提供认证令牌', code: 'NO_TOKEN' })
    }

    const token = authHeader.replace('Bearer ', '')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    return res.status(401).json({ success: false, error: '令牌无效或已过期', code: 'INVALID_TOKEN' })
  }
}

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: '需要管理员权限', code: 'FORBIDDEN' })
  }
  next()
}

module.exports = { auth, requireAdmin }
