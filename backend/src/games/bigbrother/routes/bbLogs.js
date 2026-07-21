const express = require('express')
const router = express.Router()
const { auth, requireAdmin } = require('../../../middleware/auth')
const BBOperationLog = require('../models/BBOperationLog')

// GET / - 获取日志列表
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, pageSize = 50 } = req.query
    const currentPage = Number(page) || 1
    const currentPageSize = Number(pageSize) || 50
    const skip = (currentPage - 1) * currentPageSize
    const [documents, total] = await Promise.all([
      BBOperationLog.find({ gameId: 'bigbrother' }),
      BBOperationLog.countDocuments({ gameId: 'bigbrother' })
    ])
    documents.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    const list = documents.slice(skip, skip + currentPageSize)
    res.json({
      success: true,
      data: {
        list: list.map(l => l.toObject()),
        total,
        page: currentPage,
        pageSize: currentPageSize,
        totalPages: Math.ceil(total / currentPageSize)
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取日志失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
