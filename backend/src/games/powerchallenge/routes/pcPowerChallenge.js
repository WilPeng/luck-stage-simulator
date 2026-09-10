const express = require('express')
const router = express.Router()
const { auth, requireAdmin } = require('../../../middleware/auth')
const PCPowerChallenge = require('../models/PCPowerChallenge')

// GET /list - Get all pools
router.get('/list', async (req, res) => {
  try {
    const docs = await PCPowerChallenge.find({ gameId: 'powerchallenge' })
    res.json({ success: true, data: docs.map(d => d.toObject()) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取题目池失败' })
  }
})

// GET /:id - Get single pool
router.get('/:id', async (req, res) => {
  try {
    const doc = await PCPowerChallenge.findOne({ id: req.params.id })
    if (!doc) return res.status(404).json({ success: false, error: '题目池不存在' })
    res.json({ success: true, data: doc.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取题目池失败' })
  }
})

// POST / - Create pool
router.post('/', async (req, res) => {
  try {
    const { name, theme, questions } = req.body
    if (!theme || !questions || !Array.isArray(questions) || questions.length < 1) {
      return res.status(400).json({ success: false, error: '主题和至少1道题目为必填' })
    }
    const id = `pc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const doc = new PCPowerChallenge({
      id, gameId: 'powerchallenge', name: name || '实力大挑战', theme, questions, enabled: true
    })
    await doc.save()
    res.json({ success: true, data: doc.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '创建题目池失败' })
  }
})

// PUT /:id - Update pool
router.put('/:id', async (req, res) => {
  try {
    const { theme, questions, name } = req.body
    const doc = await PCPowerChallenge.findOne({ id: req.params.id })
    if (!doc) return res.status(404).json({ success: false, error: '题目池不存在' })
    if (theme !== undefined) doc.theme = theme
    if (name !== undefined) doc.name = name
    if (questions !== undefined && Array.isArray(questions)) {
      doc.questions = questions.map(q => ({
        id: q.id || crypto.randomUUID(),
        text: q.text || '',
        options: q.options || [],
        correctAnswer: q.correctAnswer || ''
      }))
    }
    doc.updatedAt = new Date().toISOString()
    await doc.save()
    res.json({ success: true, data: doc.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '更新题目池失败' })
  }
})

// DELETE /:id - Delete pool
router.delete('/:id', async (req, res) => {
  try {
    await PCPowerChallenge.deleteOne({ id: req.params.id })
    res.json({ success: true, data: { deleted: true } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '删除题目池失败' })
  }
})

// POST /toggle/:id - Toggle enable/disable
router.post('/toggle/:id', async (req, res) => {
  try {
    const doc = await PCPowerChallenge.findOne({ id: req.params.id })
    if (!doc) return res.status(404).json({ success: false, error: '题目池不存在' })
    doc.enabled = !doc.enabled
    await doc.save()
    res.json({ success: true, data: doc.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '操作失败' })
  }
})

module.exports = router
