const express = require('express')
const router = express.Router()
const OperationLog = require('../models/OperationLog')
const { auth, requireAdmin } = require('../middleware/auth')
const { generateId } = require('../utils/helpers')

router.get('/', auth, requireAdmin, async (req, res) => {
  try {
    const { userId, limit = 20 } = req.query
    const filter = { limit: parseInt(limit) }
    if (userId) {
      filter.userId = userId
    }
    const logs = await OperationLog.find(filter)
    const logsData = logs.map(l => {
      const obj = l.toObject()
      delete obj._id
      return obj
    })
    res.json({ success: true, data: logsData })
  } catch (error) {
    console.error('Get logs error:', error)
    res.status(500).json({ success: false, error: '获取日志失败', code: 'SERVER_ERROR' })
  }
})

router.post('/', auth, async (req, res) => {
  try {
    const { actionType, targetType, targetId, detail } = req.body

    const log = new OperationLog({
      id: generateId(),
      userId: req.user.userId,
      userName: req.user.name || 'Unknown',
      role: req.user.role,
      actionType,
      targetType,
      targetId,
      detail,
      createdAt: new Date().toISOString()
    })
    await log.save()

    const logObj = log.toObject()
    delete logObj._id

    res.json({ success: true, data: logObj })
  } catch (error) {
    console.error('Create log error:', error)
    res.status(500).json({ success: false, error: '创建日志失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
