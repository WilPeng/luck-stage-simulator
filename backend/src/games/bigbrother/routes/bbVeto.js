const express = require('express')
const router = express.Router()
const BBVetoRecord = require('../models/BBVetoRecord')
const BBHouseguest = require('../models/BBHouseguest')
const { generateId, logAction, getCurrentSeason, BB_ACTION_TYPES, hasTwist } = require('../helpers')

// GET /current - 获取当前轮次否决权记录
router.get('/current', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const roundConfigs = season.roundConfigs || []
    const record = await BBVetoRecord.findOne({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    let data = record ? record.toObject() : null
    // 补充 winnerAvatar
    if (data && data.winnerId) {
      const winner = await BBHouseguest.findOne({ id: data.winnerId })
      if (winner) data.winnerAvatar = winner.avatar || null
    }
    res.json({
      success: true,
      data,
      twists: {
        isBoomerangPendant: hasTwist(season.currentRound, 'boomerang_pendant', season.twistConfigs, roundConfigs),
        isNoPendantChallenge: hasTwist(season.currentRound, 'no_pendant_challenge', season.twistConfigs, roundConfigs)
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取否决权信息失败', code: 'SERVER_ERROR' })
  }
})

// POST /draw - 抽取否决权参与者（仅在 veto_competition 阶段可操作）
// 规则：HOH和被提名者必定参加，再从所有活跃房客中随机抽取补足至6人
// 若抽中HOH/提名者，他们可从其他未被选择的房客中自选1人
router.post('/draw', async (req, res) => {
  try {
    const { getCollection } = require('../../../config/db')
    const col = getCollection('BBHouseguest')
    const season = await getCurrentSeason()
    if (season.currentStage !== 'veto_competition') {
      return res.status(400).json({ success: false, error: '当前不是否决权竞争阶段，无法操作', code: 'WRONG_STAGE' })
    }
    const roundId = `round-${season.currentRound}`

    // 获取所有活跃房客
    const allActive = await col.find({ gameId: 'bigbrother', status: 'active', role: 'houseguest' }).toArray()

    // 获取当前 HOH 和被提名人
    const hohCol = getCollection('BBHohRecord')
    const nomCol = getCollection('BBNomination')
    const currentHoh = await hohCol.findOne({ gameId: 'bigbrother', roundId })
    const nominationDoc = await nomCol.findOne({ gameId: 'bigbrother', roundId })

    const hohId = currentHoh?.winnerId || null
    const nomineeIds = nominationDoc?.nomineeIds || []

    // HOH 和被提名者必定参加（标记 source='default'）
    const defaultIds = new Set()
    if (hohId) defaultIds.add(hohId)
    nomineeIds.forEach(id => defaultIds.add(id))

    const defaultParticipants = allActive
      .filter(h => defaultIds.has(h.id))
      .map(h => ({
        playerId: h.id,
        playerName: h.name,
        avatar: h.avatar || null,
        source: 'default'
      }))

    const defaultCount = defaultParticipants.length

    // 总参与人数目标 = 6
    const TARGET_COUNT = 6
    const needDraw = Math.max(0, TARGET_COUNT - defaultCount)

    if (allActive.length < TARGET_COUNT) {
      return res.status(400).json({
        success: false,
        error: `活跃房客不足${TARGET_COUNT}人（当前${allActive.length}人），无法抽取`,
        code: 'NOT_ENOUGH_PLAYERS'
      })
    }

    // 从所有活跃房客中随机抽取 needDraw 人（不排除HOH/提名者）
    const shuffled = [...allActive]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const drawnPlayers = shuffled.slice(0, needDraw)
    const drawnParticipantList = drawnPlayers.map(p => ({
      playerId: p.id,
      playerName: p.name,
      avatar: p.avatar || null,
      source: 'drawn'
    }))

    // 完整参与者列表：默认参加 + 随机抽取（可能重复，去重以drawn为准覆盖default）
    const participantMap = new Map()
    for (const p of defaultParticipants) {
      participantMap.set(p.playerId, p)
    }
    for (const p of drawnParticipantList) {
      // 抽中的覆盖默认标记（以drawn为准）
      participantMap.set(p.playerId, p)
    }
    const participantList = Array.from(participantMap.values())

    // 已参与者ID集合
    const participantIds = new Set(participantList.map(p => p.playerId))

    // 判断哪些被抽中的HOH/提名者可以自选
    // 条件：在drawn中 且 是HOH或提名者
    const canPick = []
    for (const p of drawnParticipantList) {
      if (p.playerId === hohId) {
        canPick.push({ playerId: p.playerId, playerName: p.playerName, role: 'hoh' })
      } else if (nomineeIds.includes(p.playerId)) {
        canPick.push({ playerId: p.playerId, playerName: p.playerName, role: 'nominee' })
      }
    }

    // 可选池：所有活跃房客中，未被选中的
    const pickablePlayers = allActive
      .filter(h => !participantIds.has(h.id))
      .map(h => ({ playerId: h.id, playerName: h.name }))

    // 保存抽选结果到否决权记录（暂不选赢家）
    await BBVetoRecord.deleteMany({ gameId: 'bigbrother', roundId })
    const record = new BBVetoRecord({
      id: generateId(),
      roundId,
      roundIndex: season.currentRound,
      winnerId: null,
      winnerName: '',
      used: false,
      status: 'pending',
      participants: participantList,
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
    await record.save()

    res.json({
      success: true,
      data: {
        ...record.toObject(),
        participants: participantList,
        totalPlayers: allActive.length,
        defaultCount,
        drawCount: needDraw,
        drawMode: 'houseguest_choice',
        canPick,
        pickablePlayers,
        hohId,
        nomineeIds
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '抽取参与者失败', code: 'SERVER_ERROR' })
  }
})

// POST /pick - 被抽中的HOH/提名者自选1人加入POV（仅在 veto_competition 阶段可操作）
router.post('/pick', async (req, res) => {
  try {
    const { pickedByPlayerId, pickedPlayerId } = req.body
    if (!pickedByPlayerId || !pickedPlayerId) {
      return res.status(400).json({ success: false, error: '缺少参数', code: 'MISSING_PARAMS' })
    }

    const season = await getCurrentSeason()
    if (season.currentStage !== 'veto_competition') {
      return res.status(400).json({ success: false, error: '当前不是否决权竞争阶段，无法操作', code: 'WRONG_STAGE' })
    }
    const roundId = `round-${season.currentRound}`

    const { getCollection } = require('../../../config/db')
    const col = getCollection('BBHouseguest')

    // 读取已有的否决权记录
    const existingRecord = await BBVetoRecord.findOne({ gameId: 'bigbrother', roundId })
    if (!existingRecord || !existingRecord.participants || existingRecord.participants.length === 0) {
      return res.status(400).json({ success: false, error: '尚未抽取参与者，请先抽取', code: 'NO_PARTICIPANTS' })
    }

    // 获取当前 HOH 和被提名人
    const hohCol = getCollection('BBHohRecord')
    const nomCol = getCollection('BBNomination')
    const currentHoh = await hohCol.findOne({ gameId: 'bigbrother', roundId })
    const nominationDoc = await nomCol.findOne({ gameId: 'bigbrother', roundId })
    const hohId = currentHoh?.winnerId || null
    const nomineeIds = nominationDoc?.nomineeIds || []

    // 校验：pickedByPlayerId 必须是抽中的HOH或提名者
    const drawnParticipant = existingRecord.participants.find(
      p => p.playerId === pickedByPlayerId && p.source === 'drawn'
    )
    if (!drawnParticipant) {
      return res.status(400).json({ success: false, error: '该玩家不在抽中名单中', code: 'NOT_DRAWN' })
    }
    if (pickedByPlayerId !== hohId && !nomineeIds.includes(pickedByPlayerId)) {
      return res.status(400).json({ success: false, error: '该玩家不是HOH或被提名者，无权自选', code: 'NOT_ELIGIBLE' })
    }

    // 校验：该玩家是否已经自选过了
    const alreadyPicked = existingRecord.participants.find(
      p => p.source === 'picked' && p.pickedBy === pickedByPlayerId
    )
    if (alreadyPicked) {
      return res.status(400).json({ success: false, error: '该玩家已经自选过了', code: 'ALREADY_PICKED' })
    }

    // 校验：pickedPlayerId 不能是已有的参与者
    const existingIds = new Set(existingRecord.participants.map(p => p.playerId))
    if (existingIds.has(pickedPlayerId)) {
      return res.status(400).json({ success: false, error: '该房客已被选中，请选择其他人', code: 'ALREADY_IN_PARTICIPANTS' })
    }

    // 校验：pickedPlayerId 必须是活跃房客
    const pickedPlayer = await col.findOne({ gameId: 'bigbrother', id: pickedPlayerId, status: 'active' })
    if (!pickedPlayer) {
      return res.status(400).json({ success: false, error: '所选房客不存在或已淘汰', code: 'PLAYER_NOT_FOUND' })
    }

    // 添加自选玩家到参与者列表
    existingRecord.participants.push({
      playerId: pickedPlayerId,
      playerName: pickedPlayer.name,
      avatar: pickedPlayer.avatar || null,
      source: 'picked',
      pickedBy: pickedByPlayerId
    })
    existingRecord.updatedAt = new Date().toISOString()
    await existingRecord.save()

    res.json({
      success: true,
      data: {
        ...existingRecord.toObject(),
        drawMode: 'houseguest_choice'
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '自选失败', code: 'SERVER_ERROR' })
  }
})

// POST /competition - 模拟否决权竞争（基于已抽取的参与者选赢家，仅在 veto_competition 阶段可操作）
router.post('/competition', async (req, res) => {
  try {
    const { minigameResult } = req.body || {}
    const season = await getCurrentSeason()
    if (season.currentStage !== 'veto_competition') {
      return res.status(400).json({ success: false, error: '当前不是否决权竞争阶段，无法操作', code: 'WRONG_STAGE' })
    }
    const roundId = `round-${season.currentRound}`

    // 读取已有的否决权记录（必须已通过 /draw 抽取了参与者）
    const existingRecord = await BBVetoRecord.findOne({ gameId: 'bigbrother', roundId })
    if (!existingRecord || !existingRecord.participants || existingRecord.participants.length === 0) {
      return res.status(400).json({ success: false, error: '尚未抽取参与者，请先抽取', code: 'NO_PARTICIPANTS' })
    }
    if (existingRecord.winnerId) {
      return res.status(400).json({ success: false, error: '已经产生获胜者，无需重复竞争', code: 'ALREADY_COMPLETED' })
    }

    // 如果有小游戏结果，使用小游戏产生的获胜者
    let winner
    if (minigameResult && minigameResult.winnerId) {
      winner = existingRecord.participants.find(p => p.playerId === minigameResult.winnerId)
      if (!winner) {
        return res.status(400).json({ success: false, error: '小游戏获胜者不在参与者列表中', code: 'INVALID_WINNER' })
      }
      const { getAllGames } = require('../minigames/loadAll')
      const games = getAllGames()
      const game = games.find(g => g.id === minigameResult.minigameId)
      existingRecord.competitionName = game ? `${game.name}` : '小游戏竞争'
    } else {
      // 从已有参与者中随机选赢家
      const participants = existingRecord.participants
      winner = participants[Math.floor(Math.random() * participants.length)]
    }

    // 更新记录
    existingRecord.winnerId = winner.playerId
    existingRecord.winnerName = winner.playerName
    existingRecord.status = 'pending'
    existingRecord.updatedAt = new Date().toISOString()
    await existingRecord.save()

    res.json({
      success: true,
      data: {
        ...existingRecord.toObject(),
        participants,
        drawMode: 'houseguest_choice'
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '否决权竞争失败', code: 'SERVER_ERROR' })
  }
})

// POST /use - 使用否决权（仅在 veto_ceremony 阶段可操作）
router.post('/use', async (req, res) => {
  try {
    const { targetPlayerId, targetPlayerName } = req.body
    const season = await getCurrentSeason()
    if (season.currentStage !== 'veto_ceremony') {
      return res.status(400).json({ success: false, error: '当前不是否决权会议阶段，无法操作', code: 'WRONG_STAGE' })
    }
    const roundId = `round-${season.currentRound}`
    const { getCollection } = require('../../../config/db')
    // 更新否决权记录
    const vetoCol = getCollection('BBVetoRecord')
    const record = await vetoCol.findOne({ gameId: 'bigbrother', roundId })
    if (!record) return res.status(404).json({ success: false, error: '否决权记录不存在', code: 'NOT_FOUND' })

    // Twist #1 回旋镖护符：使用时所有被提名者全救
    const roundConfigs = season.roundConfigs || []
    const isBoomerang = hasTwist(season.currentRound, 'boomerang_pendant', season.twistConfigs, roundConfigs)

    await vetoCol.updateOne(
      { gameId: 'bigbrother', roundId },
      { $set: { used: true, status: 'used', usedOnPlayerId: targetPlayerId, usedOnPlayerName: targetPlayerName, updatedAt: new Date().toISOString() } }
    )

    const nomCol = getCollection('BBNomination')
    const nominationDoc = await nomCol.findOne({ gameId: 'bigbrother', roundId })

    if (nominationDoc) {
      if (isBoomerang) {
        // 回旋镖护符：清空所有被提名人，HOH 需重新提名全部人
        await nomCol.updateOne(
          { gameId: 'bigbrother', roundId },
          { $set: { nomineeIds: [], nomineeNames: [], vetoUsed: true, updatedAt: new Date().toISOString() } }
        )
        res.json({
          success: true,
          data: { used: true, targetPlayerId, targetPlayerName, saved: true, boomerang: true, message: '回旋镖护符生效！所有被提名者全部获救，HOH 需重新提名全部人' }
        })
      } else {
        // 普通否决权：从提名名单中移除被拯救者
        if (nominationDoc.nomineeIds) {
          const savedIdx = nominationDoc.nomineeIds.indexOf(targetPlayerId)
          if (savedIdx !== -1) {
            const newNomineeIds = nominationDoc.nomineeIds.filter(id => id !== targetPlayerId)
            const newNomineeNames = nominationDoc.nomineeNames.filter((_, i) => i !== savedIdx)
            await nomCol.updateOne(
              { gameId: 'bigbrother', roundId },
              { $set: { nomineeIds: newNomineeIds, nomineeNames: newNomineeNames, vetoUsed: true, updatedAt: new Date().toISOString() } }
            )
          }
        }
        res.json({ success: true, data: { used: true, targetPlayerId, targetPlayerName, saved: true } })
      }
    } else {
      res.json({ success: true, data: { used: true, targetPlayerId, targetPlayerName, saved: false, message: '提名记录不存在' } })
    }
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '使用否决权失败', code: 'SERVER_ERROR' })
  }
})

// POST /skip - 不使用否决权（仅在 veto_ceremony 阶段可操作）
router.post('/skip', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    if (season.currentStage !== 'veto_ceremony') {
      return res.status(400).json({ success: false, error: '当前不是否决权会议阶段，无法操作', code: 'WRONG_STAGE' })
    }
    const record = await BBVetoRecord.findOne({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    if (record) {
      record.used = false
      record.status = 'skipped'
      record.updatedAt = new Date().toISOString()
      await record.save()
    }
    res.json({ success: true, data: record ? record.toObject() : null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '跳过否决权失败', code: 'SERVER_ERROR' })
  }
})

// GET /history - 获取否决权历史
router.get('/history', async (req, res) => {
  try {
    const { getCollection } = require('../../../config/db')
    const col = getCollection('BBVetoRecord')
    const docs = await col.find({ gameId: 'bigbrother' }).sort({ createdAt: -1 }).toArray()
    const records = docs.map(d => new BBVetoRecord(d).toObject())
    res.json({ success: true, data: records })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取否决权历史失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
