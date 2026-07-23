const express = require('express')
const router = express.Router()
const LVLoveVote = require('../models/LVLoveVote')
const LVPlayer = require('../models/LVPlayer')
const { generateId, logAction, getCurrentSeason, LV_ACTION_TYPES, randomInt, randomVoteBudget } = require('../helpers')

// GET /my-budget/:roundId - 获取当前用户的喜爱值预算
router.get('/my-budget/:roundId', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const voter = await LVPlayer.findOne({ id: decoded.userId })
    if (!voter) return res.status(404).json({ success: false, error: '用户不存在', code: 'NOT_FOUND' })

    res.json({ success: true, data: { budget: voter.voteBudget ?? 0 } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取预算失败', code: 'SERVER_ERROR' })
  }
})

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
    if (!season || season.currentStage === 'waiting') {
      return res.status(400).json({ success: false, error: '游戏尚未开始', code: 'WAITING' })
    }
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

    // 校验：必须投送给所有活跃选手（排除自己和管理员）
    const allActiveTargets = await LVPlayer.find({ status: 'active', role: { $ne: 'admin' }, id: { $ne: decoded.userId } })
    if (votes.length !== allActiveTargets.length) {
      return res.status(400).json({
        success: false,
        error: `必须给所有 ${allActiveTargets.length} 位活跃选手投送喜爱值（当前仅投送了 ${votes.length} 位）`,
        code: 'MISSING_TARGETS'
      })
    }
    const activeTargetIds = new Set(allActiveTargets.map(p => p.id))
    for (const v of votes) {
      if (!activeTargetIds.has(v.targetId)) {
        return res.status(400).json({ success: false, error: `选手 ${v.targetName || v.targetId} 不是活跃状态`, code: 'INVALID_TARGET' })
      }
    }

    // 校验：所有值必须为整数
    for (const v of votes) {
      if (!Number.isInteger(v.value)) {
        return res.status(400).json({ success: false, error: '喜爱值必须是整数', code: 'INVALID_VALUE_TYPE' })
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

    // 校验：总额必须等于该选手的预算
    if (sum !== (voter.voteBudget ?? 0)) {
      return res.status(400).json({ success: false, error: '投送总和必须等于系统分配的预算', code: 'BUDGET_MISMATCH' })
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

// POST /admin-set-budget - 管理员设置选手喜爱值预算
router.post('/admin-set-budget', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const admin = await LVPlayer.findOne({ id: decoded.userId })
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ success: false, error: '仅管理员可执行此操作', code: 'FORBIDDEN' })
    }

    const { playerId, budget } = req.body
    if (!playerId) {
      return res.status(400).json({ success: false, error: '参数不完整', code: 'INVALID_PARAMS' })
    }

    const player = await LVPlayer.findOne({ id: playerId })
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })
    if (player.role === 'admin') return res.status(400).json({ success: false, error: '不能设置管理员的预算', code: 'IS_ADMIN' })

    // budget 为空或非数字时重新随机，否则使用指定值
    const newBudget = (budget !== undefined && budget !== null && typeof budget === 'number' && budget >= 1)
      ? Math.floor(budget)
      : randomVoteBudget()

    player.voteBudget = newBudget
    await player.save()

    const actionDetail = (budget !== undefined && budget !== null && typeof budget === 'number' && budget >= 1)
      ? `管理员设置选手 ${player.name} 的预算为 ${newBudget}`
      : `管理员重新随机选手 ${player.name} 的预算为 ${newBudget}`

    await logAction(admin.id, admin.name, 'admin',
      LV_ACTION_TYPES.VOTE_ADMIN_SUBMIT, 'vote', playerId, actionDetail)

    res.json({ success: true, data: { playerId: player.id, playerName: player.name, voteBudget: newBudget } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置预算失败', code: 'SERVER_ERROR' })
  }
})

// POST /admin-batch-set-budget - 管理员批量设置选手预算
router.post('/admin-batch-set-budget', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const admin = await LVPlayer.findOne({ id: decoded.userId })
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ success: false, error: '仅管理员可执行此操作', code: 'FORBIDDEN' })
    }

    const { playerIds, budget } = req.body
    if (!playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
      return res.status(400).json({ success: false, error: '参数不完整', code: 'INVALID_PARAMS' })
    }

    const results = []
    for (const playerId of playerIds) {
      const player = await LVPlayer.findOne({ id: playerId })
      if (!player || player.role === 'admin') continue

      const newBudget = (budget !== undefined && budget !== null && typeof budget === 'number' && budget >= 1)
        ? Math.floor(budget)
        : randomVoteBudget()

      player.voteBudget = newBudget
      await player.save()
      results.push({ playerId: player.id, playerName: player.name, voteBudget: newBudget })
    }

    await logAction(admin.id, admin.name, 'admin',
      LV_ACTION_TYPES.VOTE_ADMIN_SUBMIT, 'vote', 'batch',
      `管理员批量设置 ${results.length} 位选手的预算`)

    res.json({ success: true, data: results })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '批量设置预算失败', code: 'SERVER_ERROR' })
  }
})

// POST /admin-revoke - 管理员撤回选手的投送
router.post('/admin-revoke', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const admin = await LVPlayer.findOne({ id: decoded.userId })
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ success: false, error: '仅管理员可执行此操作', code: 'FORBIDDEN' })
    }

    const { roundId, voterId } = req.body
    if (!roundId || !voterId) {
      return res.status(400).json({ success: false, error: '参数不完整', code: 'INVALID_PARAMS' })
    }

    const voter = await LVPlayer.findOne({ id: voterId })
    if (!voter) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })

    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVLoveVote')
    const result = await col.deleteMany({ gameId: 'lovevariety', roundId, voterId })

    await logAction(admin.id, admin.name, 'admin',
      LV_ACTION_TYPES.VOTE_ADMIN_SUBMIT, 'vote', voterId,
      `管理员撤回选手 ${voter.name} 的投送，共删除 ${result.deletedCount || 0} 条记录`)

    res.json({ success: true, data: { deletedCount: result.deletedCount || 0, voterName: voter.name } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '撤回投送失败', code: 'SERVER_ERROR' })
  }
})

// POST /admin-auto-submit - 管理员一键自动代投（随机分配所有目标）
router.post('/admin-auto-submit', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const admin = await LVPlayer.findOne({ id: decoded.userId })
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ success: false, error: '仅管理员可执行此操作', code: 'FORBIDDEN' })
    }

    const { roundId, voterId } = req.body
    if (!roundId || !voterId) {
      return res.status(400).json({ success: false, error: '参数不完整', code: 'INVALID_PARAMS' })
    }

    const season = await getCurrentSeason()
    if (!season || season.currentStage === 'waiting') {
      return res.status(400).json({ success: false, error: '游戏尚未开始', code: 'WAITING' })
    }
    if (season.currentStage !== 'love_vote') {
      return res.status(400).json({ success: false, error: '当前不是喜爱值投送阶段', code: 'WRONG_STAGE' })
    }

    const voter = await LVPlayer.findOne({ id: voterId })
    if (!voter) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })
    if (voter.status !== 'active') {
      return res.status(400).json({ success: false, error: '该选手已被淘汰', code: 'ELIMINATED' })
    }

    // 获取所有活跃选手（排除自己和管理员）
    const allPlayers = await LVPlayer.find({ status: 'active' })
    const targets = allPlayers.filter(p => p.id !== voterId && p.role !== 'admin')
    if (targets.length === 0) {
      return res.status(400).json({ success: false, error: '没有可投送的目标', code: 'NO_TARGETS' })
    }

    const budget = voter.voteBudget ?? 0
    if (budget < targets.length) {
      return res.status(400).json({ success: false, error: '预算不足以分配给所有目标', code: 'BUDGET_TOO_LOW' })
    }

    // 随机分配互不相同的整数，总和 = budget
    // 算法：先给每人随机分配基础值，然后调整使总和匹配
    const n = targets.length
    // 第一步：每人至少 1，剩余 budget - n
    let remaining = budget - n
    const values = new Array(n).fill(1)

    // 给每个人随机加值，保证不重复
    // 先随机生成 n 个互不相同的值作为增量
    if (remaining > 0) {
      // 随机生成增量，保证最终值互不相同
      const increments = []
      // 生成候选增量池
      const maxIncrement = Math.min(remaining, budget - n) // 最大增量
      const candidates = []
      for (let i = 0; i <= maxIncrement && i <= 200; i++) {
        candidates.push(i)
      }
      // 打乱后取 n 个（可重复，通过后续调整保证唯一）
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(Math.random() * candidates.length)
        increments.push(candidates[idx])
      }

      // 计算增量总和
      const incSum = increments.reduce((a, b) => a + b, 0)

      // 按比例调整使总和 = remaining
      if (incSum > 0) {
        let adjustedRemaining = remaining
        for (let i = 0; i < n; i++) {
          const inc = Math.round(increments[i] / incSum * remaining)
          values[i] += inc
          adjustedRemaining -= inc
        }
        // 处理余数
        let idx = 0
        while (adjustedRemaining > 0 && idx < n * 3) {
          const i = idx % n
          values[i]++
          adjustedRemaining--
          idx++
        }
      } else {
        // 全为0，平均分配
        const base = Math.floor(remaining / n)
        for (let i = 0; i < n; i++) {
          values[i] += base
        }
        let rest = remaining - base * n
        for (let i = 0; i < rest; i++) {
          values[i]++
        }
      }
    }

    // 确保值互不相同
    const finalValues = [...values]
    const uniqueCheck = new Set(finalValues)
    if (uniqueCheck.size !== finalValues.length) {
      // 有重复，重新调整：对值排序后微调
      const sorted = finalValues.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].v <= sorted[i - 1].v) {
          sorted[i].v = sorted[i - 1].v + 1
        }
      }
      // 检查总和是否变化，若变化则从最大值减
      const newSum = sorted.reduce((a, b) => a + b.v, 0)
      let diff = newSum - budget
      for (let i = sorted.length - 1; i >= 0 && diff > 0; i--) {
        const adjust = Math.min(diff, sorted[i].v - 1)
        sorted[i].v -= adjust
        diff -= adjust
      }
      // 放回
      sorted.forEach(s => { finalValues[s.i] = s.v })
    }

    // 构建 votes 数组
    const votes = targets.map((t, i) => ({
      targetId: t.id,
      targetName: t.name,
      value: Math.max(1, Math.round(finalValues[i]))
    }))

    // 最终校验总和
    const sum = votes.reduce((a, v) => a + v.value, 0)
    if (sum !== budget) {
      // 微调差值
      let diff = sum - budget
      let idx = 0
      while (diff !== 0 && idx < n * 5) {
        const i = idx % n
        if (diff > 0 && votes[i].value > 1) {
          votes[i].value--
          diff--
        } else if (diff < 0) {
          votes[i].value++
          diff++
        }
        idx++
      }
    }

    // 值唯一性再校验
    const valArr = votes.map(v => v.value)
    const valSet = new Set(valArr)
    if (valSet.size !== valArr.length) {
      return res.status(400).json({ success: false, error: '自动分配产生重复值，请重试', code: 'DUPLICATE_VALUES' })
    }

    // 删除旧投送
    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVLoveVote')
    await col.deleteMany({ gameId: 'lovevariety', roundId, voterId })

    // 批量插入
    const newVotes = votes.map(v => new LVLoveVote({
      id: generateId(),
      roundId,
      voterId,
      voterName: voter.name,
      targetId: v.targetId,
      targetName: v.targetName,
      value: v.value,
      gameId: 'lovevariety',
      createdAt: new Date().toISOString()
    }))

    if (newVotes.length > 0) {
      await col.insertMany(newVotes.map(v => {
        const obj = v.toObject ? v.toObject() : { ...v }
        delete obj.collectionName
        return obj
      }))
    }

    await logAction(admin.id, admin.name, 'admin',
      LV_ACTION_TYPES.VOTE_ADMIN_SUBMIT, 'vote', roundId,
      `管理员一键自动代投: 代选手 ${voter.name} 随机分配 ${sum} 点给 ${votes.length} 人`)

    res.json({
      success: true,
      data: {
        count: newVotes.length,
        voterName: voter.name,
        votes: votes.map(v => ({ targetName: v.targetName, value: v.value }))
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '一键代投失败', code: 'SERVER_ERROR' })
  }
})

// POST /admin-submit - 管理员代选手投送喜爱值
router.post('/admin-submit', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // 校验管理员权限
    const admin = await LVPlayer.findOne({ id: decoded.userId })
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ success: false, error: '仅管理员可执行此操作', code: 'FORBIDDEN' })
    }

    const { roundId, voterId, votes, totalValue } = req.body
    if (!roundId || !voterId || !votes || !Array.isArray(votes) || votes.length === 0) {
      return res.status(400).json({ success: false, error: '参数不完整', code: 'INVALID_PARAMS' })
    }

    const season = await getCurrentSeason()
    if (!season || season.currentStage === 'waiting') {
      return res.status(400).json({ success: false, error: '游戏尚未开始', code: 'WAITING' })
    }
    if (season.currentStage !== 'love_vote') {
      return res.status(400).json({ success: false, error: '当前不是喜爱值投送阶段', code: 'WRONG_STAGE' })
    }

    // 查找被代投选手
    const voter = await LVPlayer.findOne({ id: voterId })
    if (!voter) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })
    if (voter.status !== 'active') {
      return res.status(400).json({ success: false, error: '该选手已被淘汰', code: 'ELIMINATED' })
    }

    // 校验：不能给自己投
    for (const v of votes) {
      if (v.targetId === voterId) {
        return res.status(400).json({ success: false, error: '不能给自己投送喜爱值', code: 'SELF_VOTE' })
      }
    }

    // 校验：所有值必须为整数
    for (const v of votes) {
      if (!Number.isInteger(v.value)) {
        return res.status(400).json({ success: false, error: '喜爱值必须是整数', code: 'INVALID_VALUE_TYPE' })
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

    // 校验：总额必须等于该选手的预算
    if (sum !== (voter.voteBudget ?? 0)) {
      return res.status(400).json({ success: false, error: '投送总和必须等于系统分配的预算', code: 'BUDGET_MISMATCH' })
    }

    // 删除该轮该选手已有投送（覆盖）
    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVLoveVote')
    await col.deleteMany({ gameId: 'lovevariety', roundId, voterId })

    // 批量插入新投送
    const newVotes = votes.map(v => new LVLoveVote({
      id: generateId(),
      roundId,
      voterId,
      voterName: voter.name,
      targetId: v.targetId,
      targetName: v.targetName,
      value: v.value,
      gameId: 'lovevariety',
      createdAt: new Date().toISOString()
    }))

    if (newVotes.length > 0) {
      await col.insertMany(newVotes.map(v => {
        const obj = v.toObject ? v.toObject() : { ...v }
        delete obj.collectionName
        return obj
      }))
    }

    await logAction(admin.id, admin.name, 'admin',
      LV_ACTION_TYPES.VOTE_ADMIN_SUBMIT, 'vote', roundId,
      `管理员代投: ${admin.name} 代选手 ${voter.name} 投送喜爱值共计 ${sum} 点`)

    res.json({ success: true, data: { count: newVotes.length, voterName: voter.name } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '代投送失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
