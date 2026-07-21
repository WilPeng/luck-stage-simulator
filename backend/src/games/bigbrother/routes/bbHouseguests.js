const express = require('express')
const router = express.Router()
const BBHouseguest = require('../models/BBHouseguest')
const { generateId, logAction, BB_ACTION_TYPES } = require('../helpers')

// GET / - 获取所有房客（支持分页和搜索）
router.get('/', async (req, res) => {
  try {
    const { keyword, status, page = '1', pageSize = '20' } = req.query
    const filter = { gameId: 'bigbrother' }
    if (keyword) {
      filter.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { loginCode: { $regex: keyword, $options: 'i' } },
      ]
    }
    if (status) filter.status = status
    const currentPage = Math.max(1, parseInt(page) || 1)
    const currentPageSize = Math.max(1, Math.min(100, parseInt(pageSize) || 20))
    const skip = (currentPage - 1) * currentPageSize
    const [documents, total] = await Promise.all([
      new BBHouseguest()._getCollection().find(filter).skip(skip).limit(currentPageSize).toArray(),
      new BBHouseguest()._getCollection().countDocuments(filter)
    ])
    const list = documents.map(d => new BBHouseguest(d).toObject())
    res.json({
      success: true,
      data: {
        list,
        total,
        page: currentPage,
        pageSize: currentPageSize,
        totalPages: Math.ceil(total / currentPageSize)
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取房客列表失败', code: 'SERVER_ERROR' })
  }
})

// GET /active - 获取活跃房客（只包含 houseguest 角色，不包含 admin）
router.get('/active', async (req, res) => {
  try {
    const { getCollection } = require('../../../config/db')
    const col = getCollection('BBHouseguest')
    const docs = await col.find({ gameId: 'bigbrother', status: 'active', role: 'houseguest' }).toArray()
    const list = docs.map(d => ({ id: d.id, name: d.name, avatar: d.avatar || null, status: d.status }))
    res.json({ success: true, data: list })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取活跃房客失败', code: 'SERVER_ERROR' })
  }
})

// GET /:id - 获取单个房客
router.get('/:id', async (req, res) => {
  try {
    const houseguest = await BBHouseguest.findOne({ id: req.params.id, gameId: 'bigbrother' })
    if (!houseguest) return res.status(404).json({ success: false, error: '房客不存在', code: 'NOT_FOUND' })
    res.json({ success: true, data: houseguest.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取房客失败', code: 'SERVER_ERROR' })
  }
})

// POST / - 创建房客
router.post('/', async (req, res) => {
  try {
    const { name, loginCode } = req.body
    if (!name) return res.status(400).json({ success: false, error: '姓名不能为空', code: 'INVALID_NAME' })
    const houseguest = new BBHouseguest({
      id: generateId(),
      name,
      loginCode: loginCode || `BB-HOUSE-${Date.now()}`,
      role: 'houseguest',
      status: 'active',
      gameId: 'bigbrother'
    })
    await houseguest.save()
    res.json({ success: true, data: houseguest.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '创建房客失败', code: 'SERVER_ERROR' })
  }
})

// PUT /:id - 更新房客
router.put('/:id', async (req, res) => {
  try {
    const houseguest = await BBHouseguest.findOne({ id: req.params.id, gameId: 'bigbrother' })
    if (!houseguest) return res.status(404).json({ success: false, error: '房客不存在', code: 'NOT_FOUND' })
    const { name, loginCode, status } = req.body
    if (name) houseguest.name = name
    if (loginCode) houseguest.loginCode = loginCode
    if (status) houseguest.status = status
    houseguest.updatedAt = new Date().toISOString()
    await houseguest.save()
    res.json({ success: true, data: houseguest.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '更新房客失败', code: 'SERVER_ERROR' })
  }
})

// DELETE /:id - 删除房客
router.delete('/:id', async (req, res) => {
  try {
    const houseguest = await BBHouseguest.findOne({ id: req.params.id, gameId: 'bigbrother' })
    if (!houseguest) return res.status(404).json({ success: false, error: '房客不存在', code: 'NOT_FOUND' })
    await BBHouseguest.deleteOne({ id: req.params.id })
    res.json({ success: true, data: null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '删除房客失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
