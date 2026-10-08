const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const BBHouseguest = require('../models/BBHouseguest')
const { auth } = require('../../../middleware/auth')
const { logAction, BB_ACTION_TYPES } = require('../helpers')

// 校验密码：支持明文（初始种子）与 bcrypt 哈希两种存储
function checkPassword(input, stored) {
  if (!stored) return false
  if (/^\$2[aby]\$/.test(stored)) {
    try { return bcrypt.compareSync(input, stored) } catch { return false }
  }
  return input === stored
}

function issueToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  )
}

async function doLogin(req, res, { requireRole, forbiddenHint }) {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '账号和密码不能为空', code: 'INVALID_INPUT' })
  }
  const user = await BBHouseguest.findOne({ username: String(username).trim(), gameId: 'bigbrother' })
  if (!user || !checkPassword(password, user.password)) {
    // 诊断日志：帮助排查远程登录问题
    if (!user) {
      console.warn(`[BB Auth] login failed: username "${String(username).trim()}" not found`)
    } else {
      const ptype = !user.password ? 'empty' : (/^\$2[aby]\$/.test(user.password) ? 'bcrypt' : 'plaintext')
      console.warn(`[BB Auth] login failed: username "${user.username}" password mismatch (stored: ${ptype})`)
    }
    return res.status(401).json({ success: false, error: '账号或密码错误', code: 'INVALID_CREDENTIALS' })
  }
  if (requireRole && user.role !== requireRole) {
    return res.status(403).json({ success: false, error: forbiddenHint || '无权登录', code: 'FORBIDDEN' })
  }
  user.hasLogin = true
  await user.save()
  const token = issueToken(user)
  const userObj = user.toObject()
  delete userObj.password
  await logAction(user.id, user.name, user.role, BB_ACTION_TYPES.LOGIN, 'user', user.id, `用户 ${user.name} 登录`)
  return res.json({ success: true, data: userObj, token })
}

// POST /auth/login - 选手登录（账号 + 密码）
router.post('/login', async (req, res) => {
  try {
    return await doLogin(req, res, {
      requireRole: 'houseguest',
      forbiddenHint: '管理员请从管理员登录入口登录'
    })
  } catch (error) {
    console.error('BB Login error:', error)
    res.status(500).json({ success: false, error: '登录失败', code: 'SERVER_ERROR' })
  }
})

// POST /auth/admin/login - 管理员登录（独立入口，仅管理员）
router.post('/admin/login', async (req, res) => {
  try {
    // 容错：老库可能没有 username='admin' 的记录，用首个管理员账号补齐
    if (String(req.body?.username || '').trim() === 'admin') {
      const exists = await BBHouseguest.findOne({ username: 'admin', gameId: 'bigbrother' })
      if (!exists) {
        const firstAdmin = await BBHouseguest.findOne({ role: 'admin', gameId: 'bigbrother' })
        if (firstAdmin) {
          firstAdmin.username = 'admin'
          if (!firstAdmin.password) firstAdmin.password = 'ADMIN2026'
          await firstAdmin.save()
        }
      }
    }
    return await doLogin(req, res, {
      requireRole: 'admin',
      forbiddenHint: '该账号不是管理员'
    })
  } catch (error) {
    console.error('BB Admin login error:', error)
    res.status(500).json({ success: false, error: '登录失败', code: 'SERVER_ERROR' })
  }
})

// GET /auth/admin/status - 诊断：是否存在可用管理员账号（不返回密码）
router.get('/admin/status', async (req, res) => {
  try {
    const admin = await BBHouseguest.findOne({ gameId: 'bigbrother', username: 'admin' })
    const passwordType = !admin ? null : (!admin.password ? 'empty' : (/^\$2[aby]\$/.test(admin.password) ? 'bcrypt' : 'plaintext'))
    res.json({ success: true, data: { hasAdmin: !!admin, username: admin ? admin.username : null, role: admin ? admin.role : null, passwordType } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '诊断失败' })
  }
})

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: '未提供认证令牌', code: 'NO_TOKEN' })
    }
    const token = authHeader.replace('Bearer ', '')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await BBHouseguest.findOne({ id: decoded.userId })
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在', code: 'USER_NOT_FOUND' })
    }
    const userObj = user.toObject()
    delete userObj.password
    res.json({ success: true, data: userObj })
  } catch (error) {
    res.status(401).json({ success: false, error: '令牌无效或已过期', code: 'INVALID_TOKEN' })
  }
})

// POST /auth/change-password - 选手自助修改密码（不可修改账号）
router.post('/change-password', auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {}
    if (!newPassword || String(newPassword).length < 4) {
      return res.status(400).json({ success: false, error: '新密码至少需要 4 位', code: 'WEAK_PASSWORD' })
    }
    const user = await BBHouseguest.findOne({ id: req.user.userId, gameId: 'bigbrother' })
    if (!user) return res.status(404).json({ success: false, error: '用户不存在', code: 'USER_NOT_FOUND' })
    if (!checkPassword(oldPassword, user.password)) {
      return res.status(401).json({ success: false, error: '原密码错误', code: 'INVALID_OLD_PASSWORD' })
    }
    user.password = String(newPassword)
    await user.save()
    await logAction(user.id, user.name, user.role, BB_ACTION_TYPES.UPDATE || 'UPDATE', 'user', user.id, `用户 ${user.name} 修改密码`)
    res.json({ success: true, data: null })
  } catch (error) {
    console.error('BB change password error:', error)
    res.status(500).json({ success: false, error: '修改密码失败', code: 'SERVER_ERROR' })
  }
})

router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: '未提供认证令牌', code: 'NO_TOKEN' })
    }
    const token = authHeader.replace('Bearer ', '')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await BBHouseguest.findOne({ id: decoded.userId })
    if (user) {
      user.hasLogin = false
      await user.save()
    }
    res.json({ success: true, data: null })
  } catch (error) {
    res.json({ success: true, data: null })
  }
})

module.exports = router
