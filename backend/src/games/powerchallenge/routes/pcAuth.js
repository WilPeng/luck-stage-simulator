const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const PCPlayer = require('../models/PCPlayer')
const { generateId } = require('../helpers')

// POST /login - Login by code
router.post('/login', async (req, res) => {
  try {
    const { code } = req.body
    if (!code) return res.status(400).json({ success: false, error: '登录码不能为空' })
    const user = await PCPlayer.findOne({ loginCode: code, gameId: 'powerchallenge' })
    if (!user) return res.status(404).json({ success: false, error: '登录码不存在' })
    if (user.status !== 'active') return res.status(403).json({ success: false, error: '账号已禁用' })

    const token = jwt.sign(
      { userId: user.id, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    )
    user.hasLogin = true
    user.updatedAt = new Date().toISOString()
    await user.save()

    res.json({ success: true, data: user.toObject(), token })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '登录失败' })
  }
})

// GET /me - Current user
router.get('/me', async (req, res) => {
  try {
    const decoded = req.user
    const user = await PCPlayer.findOne({ id: decoded.userId })
    if (!user) return res.status(404).json({ success: false, error: '用户不存在' })
    res.json({ success: true, data: user.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取用户信息失败' })
  }
})

// POST /logout - Logout
router.post('/logout', async (req, res) => {
  try {
    const decoded = req.user
    const user = await PCPlayer.findOne({ id: decoded.userId })
    if (user) {
      user.hasLogin = false
      await user.save()
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '登出失败' })
  }
})

module.exports = router
