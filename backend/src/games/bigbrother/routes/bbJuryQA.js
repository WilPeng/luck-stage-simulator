const express = require('express')
const router = express.Router()
const BBJuryQA = require('../models/BBJuryQA')
const BBSeason = require('../models/BBSeason')
const { generateId } = require('../helpers')
const { auth, requireAdmin } = require('../../../middleware/auth')
const { broadcastBBGame } = require('../../../socket/bbGame')

// GET / - 当前轮次陪审团问答列表
router.get('/', auth, async (req, res) => {
  try {
    const season = await BBSeason.findOne({ gameId: 'bigbrother' })
    const roundId = `round-${season?.currentRound || 1}`
    const docs = await BBJuryQA.find({ gameId: 'bigbrother', roundId })
    docs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    res.json({ success: true, data: docs.map(d => d.toObject()) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取陪审团问答失败' })
  }
})

// POST /ask - 陪审团成员提问
router.post('/ask', auth, async (req, res) => {
  try {
    const { question } = req.body || {}
    if (!question || !String(question).trim()) {
      return res.status(400).json({ success: false, error: '问题不能为空' })
    }
    const season = await BBSeason.findOne({ gameId: 'bigbrother' })
    const roundId = `round-${season?.currentRound || 1}`
    const doc = new BBJuryQA({
      id: generateId(),
      roundId,
      juryId: req.user?.userId || null,
      juryName: req.user?.name || '',
      question: String(question).trim(),
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
    await doc.save()
    broadcastBBGame('bb:jury-qa', { roundId })
    res.json({ success: true, data: doc.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '提问失败' })
  }
})

// POST /answer - 决赛选手回答问题
router.post('/answer', auth, async (req, res) => {
  try {
    const { questionId, answer } = req.body || {}
    if (!questionId || !answer || !String(answer).trim()) {
      return res.status(400).json({ success: false, error: '缺少参数' })
    }
    const doc = await BBJuryQA.findOne({ id: questionId, gameId: 'bigbrother' })
    if (!doc) return res.status(404).json({ success: false, error: '问题不存在' })
    doc.answer = String(answer).trim()
    doc.answerBy = req.user?.userId || null
    doc.answerByName = req.user?.name || ''
    doc.answeredAt = new Date().toISOString()
    doc.updatedAt = doc.answeredAt
    await doc.save()
    broadcastBBGame('bb:jury-qa', { roundId: doc.roundId })
    res.json({ success: true, data: doc.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '回答失败' })
  }
})

// DELETE /:id - 管理员删除
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    await BBJuryQA.deleteOne({ id: req.params.id, gameId: 'bigbrother' })
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

module.exports = router
