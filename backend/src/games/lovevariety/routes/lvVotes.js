const express = require('express')
const router = express.Router()
const LVLoveVote = require('../models/LVLoveVote')
const LVPlayer = require('../models/LVPlayer')
const { generateId, logAction, getCurrentSeason, LV_ACTION_TYPES } = require('../helpers')

// GET /history - 获取所有投送记录
router.get('/history', async (req, res) => {
  try {
    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVLoveVote')
    const docs = await col.find({ gameId: 'lovevariety' }).toArray()
    res.json({ success: true, data: docs })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取投送记录失败', code: 'SERVER_ERROR' })
  }
})

// GET /round/:roundId - 获取某轮投送记录
router.get('/round/:roundId', async (req, res) => {
  try {
    const { roundId } = req.params
    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVLoveVote')
    const docs = await col.find({ gameId: 'lovevariety', roundId }).toArray()
    res.json({ success: true, data: docs })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取投送记录失败', code: 'SERVER_ERROR' })
  }
})

// GET /my-votes/:roundId - 获取当前用户某轮的投送记录
router.get('/my-votes/:roundId', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const { roundId } = req.params
    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVLoveVote')
    const docs = await col.find({ gameId: 'lovevariety', roundId, voterId: decoded.userId }).toArray()
    res.json({ success: true, data: docs })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取我的投送记录失败', code: 'SERVER_ERROR' })
  }
})

// POST /submit - 提交喜爱值投送
router.post('/submit', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const { roundId, votes, totalValue } = req.body
    if (!roundId || !votes || !Array.isArray(votes) || votes.length === 0) {
      return res.status(400).json({ success: false, error: '参数不完整', code: 'INVALID_PARAMS' })
    }

    const season = await getCurrentSeason()
    if (season.currentStage !== 'love_vote') {
      return res.status(400).json({ success: false, error: '当前不是喜爱值投送阶段', code: 'WRONG_STAGE' })
    }

    const voter = await LVPlayer.findOne({ id: decoded.userId })
    if (!voter) return res.status(404).json({ success: false, error: '用户不存在', code: 'NOT_FOUND' })

    // 校验：不能给自己投
    for (const v of votes) {
      if (v.targetId === decoded.userId) {
        return res.status(400).json({ success: false, error: '不能给自己投送喜爱值', code: 'SELF_VOTE' })
      }
    }

    // 校验：所有目标值必须不重复
    const values = votes.map(v => v.value)
    const uniqueValues = new Set(values)
    if (uniqueValues.size !== values.length) {
      return res.status(400).json({ success: false, error: '每个选手的喜爱值必须不同', code: 'DUPLICATE_VALUES' })
    }

    // 校验：总和不匹配
    const sum = values.reduce((a, b) => a + b, 0)
    if (totalValue && sum !== totalValue) {
      return res.status(400).json({ success: false, error: '投送总和与分配总额不匹配', code: 'SUM_MISMATCH' })
    }

    // 删除该轮该投票人已有投送（覆盖）
    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVLoveVote')
    await col.deleteMany({ gameId: 'lovevariety', roundId, voterId: decoded.userId })

    // 批量插入新投送
    const newVotes = votes.map(v => new LVLoveVote({
      id: generateId(),
      roundId,
      voterId: decoded.userId,
      voterName: voter.name,
      targetId: v.targetId,
      targetName: v.targetName,
      value: v.value,
      gameId: 'lovevariety',
      createdAt: new Date().toISOString()
    }))

    // 使用 insertMany 而不是逐个 save
    if (newVotes.length > 0) {
      await col.insertMany(newVotes.map(v => {
        const obj = v.toObject ? v.toObject() : { ...v }
        delete obj.collectionName
        return obj
      }))
    }

    await logAction(decoded.userId, voter.name, 'player',
      LV_ACTION_TYPES.VOTE_SUBMIT, 'vote', roundId,
      `提交喜爱值投送: ${voter.name} 给 ${votes.length} 人投送共计 ${sum} 点`)

    res.json({ success: true, data: { count: newVotes.length } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '提交投送失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
