const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const BBHouseguest = require('../models/BBHouseguest')
const { generateId, logAction, BB_ACTION_TYPES } = require('../helpers')

router.post('/login', async (req, res) => {
  try {
    const { code } = req.body
    if (!code) {
      return res.status(400).json({ success: false, error: '登录码不能为空', code: 'INVALID_CODE' })
    }
    const filter = { loginCode: code, gameId: 'bigbrother' }
    const user = await BBHouseguest.findOne(filter)
    if (!user) {
      return res.status(404).json({ success: false, error: '登录码不存在', code: 'INVALID_CODE' })
    }
    user.hasLogin = true
    await user.save()
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    )
    const userObj = user.toObject()
    await logAction(user.id, user.name, user.role, BB_ACTION_TYPES.LOGIN, 'user', user.id, `用户 ${user.name} 登录`)
    res.json({ success: true, data: userObj, token })
  } catch (error) {
    console.error('BB Login error:', error)
    res.status(500).json({ success: false, error: '登录失败', code: 'SERVER_ERROR' })
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
    res.json({ success: true, data: user.toObject() })
  } catch (error) {
    res.status(401).json({ success: false, error: '令牌无效或已过期', code: 'INVALID_TOKEN' })
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
