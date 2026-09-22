const express = require('express')
const router = express.Router()
const OperationLog = require('../models/OperationLog')
const { auth, requireAdmin } = require('../middleware/auth')
const { generateId } = require('../utils/helpers')

router.get('/', auth, requireAdmin, async (req, res) => {
  try {
    const { userId, keyword } = req.query
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const pageSize = parseInt(req.query.pageSize) || 0
    const filter = { limit: 100000 }
    if (userId) {
      filter.userId = userId
    }
    let logs = await OperationLog.find(filter)
    if (keyword) {
      const k = String(keyword).toLowerCase()
      logs = logs.filter(l =>
        (l.userName || '').toLowerCase().includes(k) ||
        (l.detail || '').toLowerCase().includes(k) ||
        (l.actionType || '').toLowerCase().includes(k)
      )
    }
    logs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    const total = logs.length
    if (pageSize > 0) {
      const list = logs.slice((page - 1) * pageSize, page * pageSize).map(l => {
        const obj = l.toObject()
        delete obj._id
        return obj
      })
      return res.json({ success: true, data: { list, total, page, pageSize } })
    }
    const logsData = logs.slice(0, 200).map(l => {
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
