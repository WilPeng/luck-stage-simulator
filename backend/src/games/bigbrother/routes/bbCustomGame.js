/**
 * 自定义游戏 REST 路由
 * 管理员创建、编辑、删除、启用/禁用自定义游戏
 */
const express = require('express')
const router = express.Router()
const BBCustomGame = require('../models/BBCustomGame')
const { getCurrentSeason } = require('../helpers')

// GET /list - 获取所有自定义游戏
router.get('/list', async (req, res) => {
  try {
    const query = {}
    if (req.query.enabled !== undefined) {
      query.enabled = req.query.enabled === 'true'
    }
    const games = await BBCustomGame.find(query)
    res.json({
      success: true,
      data: games.map(g => g.toObject())
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取自定义游戏列表失败' })
  }
})

// GET /:id - 获取单个自定义游戏
router.get('/:id', async (req, res) => {
  try {
    const game = await BBCustomGame.findOne({ id: req.params.id })
    if (!game) {
      return res.status(404).json({ success: false, error: '游戏不存在' })
    }
    res.json({ success: true, data: game.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取自定义游戏失败' })
  }
})

// POST / - 创建自定义游戏
router.post('/', async (req, res) => {
  try {
    const { name, description, icon, type, questions, cooldownSeconds, maxAttempts, timeLimit, scoringRule, playerCount, winCondition } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: '游戏名称不能为空' })
    }
    if (!type || !['quiz', 'score'].includes(type)) {
      return res.status(400).json({ success: false, error: '游戏类型必须为 quiz 或 score' })
    }
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, error: '至少需要一道题目' })
    }

    // 验证题目
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (!q.text || !q.text.trim()) {
        return res.status(400).json({ success: false, error: `第${i + 1}题题目文本不能为空` })
      }
      if (!q.correctAnswer || !q.correctAnswer.trim()) {
        return res.status(400).json({ success: false, error: `第${i + 1}题正确答案不能为空` })
      }
    }

    // 生成唯一ID
    const gameId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const game = new BBCustomGame({
      id: gameId,
      name: name.trim(),
      description: (description || '').trim(),
      icon: icon || '🎮',
      type,
      questions: questions.map((q, idx) => ({
        id: q.id || `q-${idx + 1}`,
        text: q.text.trim(),
        options: (q.options || []).map(o => o.trim()).filter(Boolean),
        correctAnswer: q.correctAnswer.trim(),
        points: q.points || 1
      })),
      cooldownSeconds: cooldownSeconds ?? 5,
      maxAttempts: maxAttempts ?? 0,
      timeLimit: timeLimit ?? 120,
      scoringRule: scoringRule || 'correct_only',
      playerCount: playerCount || { min: 2, max: 20 },
      winCondition: winCondition || (type === 'quiz' ? 'first_correct' : 'highest_score'),
      enabled: true
    })

    await game.save()

    res.json({ success: true, data: game.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '创建自定义游戏失败' })
  }
})

// PUT /:id - 更新自定义游戏
router.put('/:id', async (req, res) => {
  try {
    const existing = await BBCustomGame.findOne({ id: req.params.id })
    if (!existing) {
      return res.status(404).json({ success: false, error: '游戏不存在' })
    }

    const { name, description, icon, type, questions, cooldownSeconds, maxAttempts, timeLimit, scoringRule, playerCount, winCondition, enabled } = req.body

    if (questions && Array.isArray(questions)) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i]
        if (!q.text || !q.text.trim()) {
          return res.status(400).json({ success: false, error: `第${i + 1}题题目文本不能为空` })
        }
        if (!q.correctAnswer || !q.correctAnswer.trim()) {
          return res.status(400).json({ success: false, error: `第${i + 1}题正确答案不能为空` })
        }
      }
    }

    if (name !== undefined) existing.name = name.trim()
    if (description !== undefined) existing.description = description.trim()
    if (icon !== undefined) existing.icon = icon
    if (type !== undefined && ['quiz', 'score'].includes(type)) existing.type = type
    if (questions !== undefined) {
      existing.questions = questions.map((q, idx) => ({
        id: q.id || `q-${idx + 1}`,
        text: q.text.trim(),
        options: (q.options || []).map(o => o.trim()).filter(Boolean),
        correctAnswer: q.correctAnswer.trim(),
        points: q.points || 1
      }))
    }
    if (cooldownSeconds !== undefined) existing.cooldownSeconds = cooldownSeconds
    if (maxAttempts !== undefined) existing.maxAttempts = maxAttempts
    if (timeLimit !== undefined) existing.timeLimit = timeLimit
    if (scoringRule !== undefined) existing.scoringRule = scoringRule
    if (playerCount !== undefined) existing.playerCount = playerCount
    if (winCondition !== undefined) existing.winCondition = winCondition
    if (enabled !== undefined) existing.enabled = enabled
    existing.updatedAt = new Date().toISOString()

    await existing.save()

    res.json({ success: true, data: existing.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '更新自定义游戏失败' })
  }
})

// DELETE /:id - 删除自定义游戏
router.delete('/:id', async (req, res) => {
  try {
    const existing = await BBCustomGame.findOne({ id: req.params.id })
    if (!existing) {
      return res.status(404).json({ success: false, error: '游戏不存在' })
    }

    await BBCustomGame.deleteOne({ id: req.params.id })

    res.json({ success: true, message: '已删除' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '删除自定义游戏失败' })
  }
})

// POST /:id/toggle - 启用/禁用自定义游戏
router.post('/:id/toggle', async (req, res) => {
  try {
    const existing = await BBCustomGame.findOne({ id: req.params.id })
    if (!existing) {
      return res.status(404).json({ success: false, error: '游戏不存在' })
    }

    existing.enabled = !existing.enabled
    existing.updatedAt = new Date().toISOString()
    await existing.save()

    res.json({ success: true, data: { id: existing.id, enabled: existing.enabled } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '切换启用状态失败' })
  }
})

module.exports = router
