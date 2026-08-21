const express = require('express')
const router = express.Router()
const BBNomination = require('../models/BBNomination')
const BBHouseguest = require('../models/BBHouseguest')
const {
  generateId, logAction, getCurrentSeason, BB_ACTION_TYPES,
  hasTwist, getTwistsForRound
} = require('../helpers')

// GET /current - 获取当前轮次提名
router.get('/current', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const { getCollection } = require('../../../config/db')
    const nominationCol = getCollection('BBNomination')
    const doc = await nominationCol.findOne({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    const hohCol = getCollection('BBHohRecord')
    const vetoCol = getCollection('BBVetoRecord')
    const currentHoh = await hohCol.findOne({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    const vetoRecord = await vetoCol.findOne({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })

    // Twist #27 匿名房主：HOH 姓名显示为"匿名"
    const roundConfigs = season.roundConfigs || []
    const isSecretKeeper = hasTwist(season.currentRound, 'secret_keeper', season.twistConfigs, roundConfigs)
    const displayHohName = isSecretKeeper ? '匿名' : (doc?.hohName || currentHoh?.winnerName || '')
    const displayHohId = isSecretKeeper ? '' : (doc?.hohId || currentHoh?.winnerId || '')

    if (doc) {
      res.json({
        success: true,
        data: {
          id: doc.id || '',
          roundId: doc.roundId,
          nomineeIds: doc.nomineeIds || [],
          nomineeNames: doc.nomineeNames || [],
          hohId: displayHohId,
          hohName: displayHohName,
          vetoWinnerId: vetoRecord?.winnerId || '',
          vetoWinnerName: vetoRecord?.winnerName || '',
          replacementNomineeId: doc.replacementNomineeId || null,
          replacementNomineeName: doc.replacementNomineeName || '',
          vetoUsed: doc.vetoUsed || false,
          gameId: 'bigbrother',
          createdAt: doc.createdAt || new Date().toISOString(),
          updatedAt: doc.updatedAt || '',
          // twist 信息
          isDirectDemocracy: hasTwist(season.currentRound, 'direct_democracy', season.twistConfigs, roundConfigs),
          isTripleOffering: hasTwist(season.currentRound, 'triple_offering', season.twistConfigs, roundConfigs),
          isSecretKeeper
        }
      })
    } else {
      res.json({
        success: true,
        data: null,
        twists: {
          isDirectDemocracy: hasTwist(season.currentRound, 'direct_democracy', season.twistConfigs, roundConfigs),
          isTripleOffering: hasTwist(season.currentRound, 'triple_offering', season.twistConfigs, roundConfigs),
          isSecretKeeper
        }
      })
    }
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取提名信息失败', code: 'SERVER_ERROR' })
  }
})

// POST /set - 设置提名（仅在 nomination 阶段可操作）
router.post('/set', async (req, res) => {
  try {
    const { nomineeIds, nomineeNames } = req.body
    const season = await getCurrentSeason()
    const twistConfigs = season.twistConfigs || []
    const roundConfigs = season.roundConfigs || []
    const curRound = season.currentRound

    // Twist #6 直接民主：提名不由 HOH 设置，管理员不能直接设置
    if (hasTwist(curRound, 'direct_democracy', twistConfigs, roundConfigs)) {
      return res.status(400).json({ success: false, error: '本轮为"直接民主"模式，提名由全员投票决定，不能手动设置', code: 'DIRECT_DEMOCRACY' })
    }

    // Twist #38 三重献祭：允许 2-3 人
    const isTriple = hasTwist(curRound, 'triple_offering', twistConfigs, roundConfigs)
    const minNominees = 2
    const maxNominees = isTriple ? 3 : 2

    if (!nomineeIds || !nomineeNames || nomineeIds.length < minNominees || nomineeIds.length > maxNominees) {
      return res.status(400).json({ success: false, error: `请选择 ${minNominees}~${maxNominees} 位被提名人`, code: 'INVALID_NOMINEES' })
    }
    if (season.currentStage !== 'nomination') {
      return res.status(400).json({ success: false, error: '当前不是提名阶段，无法操作', code: 'WRONG_STAGE' })
    }
    const roundId = `round-${season.currentRound}`
    await BBNomination.deleteMany({ gameId: 'bigbrother', roundId })
    // 查找当前 HOH
    const { getCollection } = require('../../../config/db')
    const hohCol = getCollection('BBHohRecord')
    const currentHoh = await hohCol.findOne({ gameId: 'bigbrother', roundId })

    // Twist #27 匿名房主：HOH 姓名存为"匿名"
    const isSecretKeeper = hasTwist(curRound, 'secret_keeper', twistConfigs, roundConfigs)
    const hohName = isSecretKeeper ? '匿名' : (currentHoh?.winnerName || '')

    const n = new BBNomination({
      id: generateId(),
      roundId,
      roundIndex: season.currentRound,
      nomineeIds: [...nomineeIds],
      nomineeNames: [...nomineeNames],
      hohId: currentHoh?.winnerId || null,
      hohName,
      replacementNomineeId: null,
      replacementNomineeName: '',
      vetoUsed: false,
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
    await n.save()
    const data = n.toObject()
    res.json({
      success: true,
      data: {
        nominees: nomineeIds.map((id, i) => ({ id, name: nomineeNames[i] })),
        roundId,
        hohId: data.hohId,
        hohName
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置提名失败', code: 'SERVER_ERROR' })
  }
})

// POST /replace - 替换提名（否决权使用后，替换人选正式加入提名名单恢复2人，仅在 replacement_nom 阶段可操作）
router.post('/replace', async (req, res) => {
  try {
    const { playerId, playerName } = req.body
    if (!playerId) return res.status(400).json({ success: false, error: '替换房客ID不能为空', code: 'INVALID_ID' })
    const season = await getCurrentSeason()
    if (season.currentStage !== 'replacement_nom') {
      return res.status(400).json({ success: false, error: '当前不是替换提名阶段，无法操作', code: 'WRONG_STAGE' })
    }
    const roundId = `round-${season.currentRound}`
    const { getCollection } = require('../../../config/db')
    const col = getCollection('BBNomination')
    const existing = await col.findOne({ gameId: 'bigbrother', roundId })
    if (existing) {
      // 如果已有替换人选，先移除旧的替换人选
      if (existing.replacementNomineeId) {
        await col.updateOne(
          { gameId: 'bigbrother', roundId },
          {
            $pull: { nomineeIds: existing.replacementNomineeId, nomineeNames: existing.replacementNomineeName },
          }
        )
      }
      // 将新的替换人选加入正式提名列表
      await col.updateOne(
        { gameId: 'bigbrother', roundId },
        {
          $push: {
            nomineeIds: playerId,
            nomineeNames: playerName
          },
          $set: {
            replacementNomineeId: playerId,
            replacementNomineeName: playerName,
            updatedAt: new Date().toISOString()
          }
        }
      )
    }
    const updated = await col.findOne({ gameId: 'bigbrother', roundId })
    res.json({ success: true, data: updated || {} })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '替换提名失败', code: 'SERVER_ERROR' })
  }
})

// POST /vote-nominees - 直接民主(#6)：全员投票决定被提名人
router.post('/vote-nominees', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const twistConfigs = season.twistConfigs || []
    const roundConfigs2 = season.roundConfigs || []
    const curRound = season.currentRound

    if (!hasTwist(curRound, 'direct_democracy', twistConfigs, roundConfigs2)) {
      return res.status(400).json({ success: false, error: '当前不是"直接民主"模式', code: 'NOT_DIRECT_DEMOCRACY' })
    }
    if (season.currentStage !== 'nomination') {
      return res.status(400).json({ success: false, error: '当前不是提名阶段，无法操作', code: 'WRONG_STAGE' })
    }

    const { votes } = req.body
    // votes: [{ voterId, voterName, targetId, targetName }]
    // HOH 的票算双倍
    if (!Array.isArray(votes) || votes.length === 0) {
      return res.status(400).json({ success: false, error: '请提供投票数据', code: 'INVALID_VOTES' })
    }

    const { getCollection } = require('../../../config/db')
    const hohCol = getCollection('BBHohRecord')
    const currentHoh = await hohCol.findOne({ gameId: 'bigbrother', roundId: `round-${curRound}` })
    const hohId = currentHoh?.winnerId || ''

    // 统计票数（HOH 双倍）
    const tally = {}
    for (const v of votes) {
      const weight = (v.voterId === hohId) ? 2 : 1
      tally[v.targetId] = (tally[v.targetId] || 0) + weight
      if (!tally[`_name_${v.targetId}`]) {
        tally[`_name_${v.targetId}`] = v.targetName
      }
    }

    // 按票数排序，取前 2 名（三重献祭取前 3 名）
    const isTriple = hasTwist(curRound, 'triple_offering', twistConfigs, roundConfigs2)
    const topN = isTriple ? 3 : 2
    const sorted = Object.entries(tally)
      .filter(([k]) => !k.startsWith('_name_'))
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)

    const nomineeIds = sorted.map(([id]) => id)
    const nomineeNames = sorted.map(([id]) => tally[`_name_${id}`] || id)

    // 保存提名
    const roundId = `round-${curRound}`
    await BBNomination.deleteMany({ gameId: 'bigbrother', roundId })

    // Twist #27 匿名房主
    const isSecretKeeper = hasTwist(curRound, 'secret_keeper', twistConfigs, roundConfigs2)
    const hohName = isSecretKeeper ? '匿名' : (currentHoh?.winnerName || '')

    const n = new BBNomination({
      id: generateId(),
      roundId,
      roundIndex: curRound,
      nomineeIds,
      nomineeNames,
      hohId: currentHoh?.winnerId || null,
      hohName,
      replacementNomineeId: null,
      replacementNomineeName: '',
      vetoUsed: false,
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
    await n.save()

    res.json({
      success: true,
      data: {
        nominees: nomineeIds.map((id, i) => ({ id, name: nomineeNames[i] })),
        roundId,
        hohId: currentHoh?.winnerId,
        hohName,
        voteTally: sorted.map(([id, count]) => ({ playerId: id, playerName: tally[`_name_${id}`], votes: count }))
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '直接民主投票失败', code: 'SERVER_ERROR' })
  }
})

// GET /history - 获取提名历史（按轮次聚合）
router.get('/history', async (req, res) => {
  try {
    const { getCollection } = require('../../../config/db')
    const nomCol = getCollection('BBNomination')
    const hohCol = getCollection('BBHohRecord')
    const docs = await nomCol.find({ gameId: 'bigbrother' }).sort({ createdAt: -1 }).toArray()
    // 按 roundId 分组
    const roundMap = new Map()
    for (const d of docs) {
      const rid = d.roundId || `round-${d.roundIndex || 1}`
      if (!roundMap.has(rid)) {
        roundMap.set(rid, {
          id: rid,
          roundId: rid,
          roundIndex: d.roundIndex,
          nomineeIds: [],
          nomineeNames: [],
          replacementNomineeId: d.replacementNomineeId || null,
          replacementNomineeName: d.replacementNomineeName || null,
          createdAt: d.createdAt || new Date().toISOString(),
          hohName: d.hohName || '',
          vetoUsed: d.vetoUsed || false
        })
      }
      const entry = roundMap.get(rid)
      if (d.nomineeIds && Array.isArray(d.nomineeIds)) {
        d.nomineeIds.forEach((id, i) => {
          if (!entry.nomineeIds.includes(id)) {
            entry.nomineeIds.push(id)
            entry.nomineeNames.push(d.nomineeNames?.[i] || '')
          }
        })
      }
    }
    // 补充 HOH 信息
    for (const [, entry] of roundMap) {
      if (!entry.hohName) {
        try {
          const hoh = await hohCol.findOne({ gameId: 'bigbrother', roundId: entry.roundId })
          if (hoh) entry.hohName = hoh.winnerName || ''
        } catch {}
      }
    }
    const result = Array.from(roundMap.values()).sort((a, b) => (b.roundIndex || 0) - (a.roundIndex || 0))
    res.json({ success: true, data: result })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取提名历史失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
