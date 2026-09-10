const express = require('express')
const router = express.Router()
const { auth, requireAdmin } = require('../../../middleware/auth')
const engine = require('../engine')

// GET / - 公开赛季摘要（不含答案）
router.get('/', async (req, res) => {
  try {
    const data = await engine.publicSummary()
    res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取赛季失败' })
  }
})

// GET /progress - 别名（兼容旧前端）
router.get('/progress', async (req, res) => {
  try {
    const data = await engine.publicSummary()
    res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取进度失败' })
  }
})

// GET /admin - 管理端完整数据（含答案与玩家）
router.get('/admin', auth, requireAdmin, async (req, res) => {
  try {
    const data = await engine.adminFull()
    res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取管理数据失败' })
  }
})

// POST /set - 管理员保存本轮配置（主题/题目/总轮数/提交间隔）
router.post('/set', auth, requireAdmin, async (req, res) => {
  try {
    const result = await engine.saveRoundConfig(req.body)
    if (!result.success) return res.status(400).json(result)
    res.json(result)
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '保存配置失败' })
  }
})

// POST /start - 开始本轮（服务端推送）
router.post('/start', auth, requireAdmin, async (req, res) => {
  try {
    const result = await engine.startRound()
    if (!result.success) return res.status(400).json(result)
    res.json(result)
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '开始失败' })
  }
})

// POST /end - 结算本轮
router.post('/end', auth, requireAdmin, async (req, res) => {
  try {
    const result = await engine.endRound()
    if (!result.success) return res.status(400).json(result)
    res.json(result)
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '结算失败' })
  }
})

// POST /next - 进入下一轮准备
router.post('/next', auth, requireAdmin, async (req, res) => {
  try {
    const result = await engine.prepareNextRound()
    if (!result.success) return res.status(400).json(result)
    res.json(result)
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '进入下一轮失败' })
  }
})

// POST /reset - 重置整季
router.post('/reset', auth, requireAdmin, async (req, res) => {
  try {
    const result = await engine.resetSeason()
    res.json(result)
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '重置失败' })
  }
})

module.exports = router
