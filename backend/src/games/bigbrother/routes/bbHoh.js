const express = require('express')
const router = express.Router()
const BBHohRecord = require('../models/BBHohRecord')
const BBHouseguest = require('../models/BBHouseguest')
const {
  generateId, logAction, getCurrentSeason, BB_ACTION_TYPES,
  hasTwist, getTwistsForRound
} = require('../helpers')

// GET / - 获取当前轮次 HOH 信息
router.get('/', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const records = await BBHohRecord.find({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    const twistConfigs = season.twistConfigs || []
    const roundConfigs = season.roundConfigs || []
    const curRound = season.currentRound

    // Twist #27 匿名房主
    const isSecretKeeper = hasTwist(curRound, 'secret_keeper', twistConfigs, roundConfigs)

    res.json({
      success: true,
      data: records.map(r => {
        const obj = r.toObject()
        if (isSecretKeeper) {
          obj.winnerName = '匿名'
        }
        return obj
      }),
      twists: {
        isSecretKeeper,
        isCondemned: hasTwist(curRound, 'condemned', twistConfigs, roundConfigs),
        isSerpentMark: hasTwist(curRound, 'serpent_mark', twistConfigs, roundConfigs),
        isKarmicPawnship: hasTwist(curRound, 'karmic_pawnship', twistConfigs, roundConfigs),
        karmicHohName: season.nextHohPlayerName || ''
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取 HOH 信息失败', code: 'SERVER_ERROR' })
  }
})

// GET /current - 获取当前 HOH
router.get('/current', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const record = await BBHohRecord.findOne({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    const roundConfigs2 = season.roundConfigs || []
    const obj = record ? record.toObject() : null

    // Twist #27 匿名房主
    if (obj && hasTwist(season.currentRound, 'secret_keeper', season.twistConfigs, roundConfigs2)) {
      obj.winnerName = '匿名'
    }

    res.json({
      success: true,
      data: obj,
      twists: {
        isKarmicPawnship: hasTwist(season.currentRound, 'karmic_pawnship', season.twistConfigs, roundConfigs2),
        karmicHohName: season.nextHohPlayerName || ''
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取当前 HOH 失败', code: 'SERVER_ERROR' })
  }
})

// GET /history - 获取 HOH 历史记录
router.get('/history', async (req, res) => {
  try {
    const { getCollection } = require('../../../config/db')
    const col = getCollection('BBHohRecord')
    const docs = await col.find({ gameId: 'bigbrother' }).sort({ createdAt: -1 }).toArray()
    const records = docs.map(d => new BBHohRecord(d).toObject())
    res.json({ success: true, data: records })
  } catch (e) {
    console.error('[BB Hoh] History error:', e)
    res.status(500).json({ success: false, error: '获取 HOH 历史失败', code: 'SERVER_ERROR' })
  }
})

// POST /competition - 模拟 HOH 竞争（随机选择一位活跃房客，排除管理员）
// 支持 minigameResult 参数：当通过小游戏产生结果时传入 { winnerId, winnerName, minigameId, scores }
router.post('/competition', async (req, res) => {
  try {
    const { minigameResult } = req.body || {}
    const { getCollection } = require('../../../config/db')
    const col = getCollection('BBHouseguest')
    const season = await getCurrentSeason()
    const twistConfigs = season.twistConfigs || []
    const roundConfigs3 = season.roundConfigs || []
    const curRound = season.currentRound

    // Twist #18 因果报应：如果有上轮幸存者自动 HOH 标记，跳过竞争
    if (hasTwist(curRound, 'karmic_pawnship', twistConfigs, roundConfigs3) && season.nextHohPlayerId) {
      const karmicWinner = await col.findOne({ id: season.nextHohPlayerId })
      if (karmicWinner && karmicWinner.status === 'active') {
        const hohCol = getCollection('BBHohRecord')
        await hohCol.deleteMany({ gameId: 'bigbrother', roundId: `round-${curRound}` })
        const record = new BBHohRecord({
          id: generateId(),
          roundId: `round-${curRound}`,
          roundIndex: curRound,
          winnerId: karmicWinner.id,
          winnerName: karmicWinner.name,
          competitionType: 'karmic',
          competitionName: '因果报应（自动HOH）',
          participants: [{ playerId: karmicWinner.id, playerName: karmicWinner.name, rank: 1 }],
          gameId: 'bigbrother',
          createdAt: new Date().toISOString()
        })
        await record.save()
        // 清除标记
        season.nextHohPlayerId = null
        season.nextHohPlayerName = ''
        season.updatedAt = new Date().toISOString()
        await season.save()

        // 处理毒蛇标记和受罚者
        await applySerpentMarks(getCollection, curRound)
        await applyCondemned(getCollection, season, karmicWinner.id)

        return res.json({ success: true, data: record.toObject(), karmic: true })
      }
      // 标记的玩家已被淘汰，清除标记
      season.nextHohPlayerId = null
      season.nextHohPlayerName = ''
      season.updatedAt = new Date().toISOString()
      await season.save()
    }

    const activeHouseguests = await col.find({ gameId: 'bigbrother', status: 'active', role: 'houseguest' }).toArray()
    if (activeHouseguests.length === 0) {
      return res.status(400).json({ success: false, error: '没有活跃房客可以参与竞争', code: 'NO_ACTIVE' })
    }

    // 如果有小游戏结果，使用小游戏产生的获胜者
    let winner, competitionType, competitionName
    if (minigameResult && minigameResult.winnerId) {
      winner = activeHouseguests.find(h => h.id === minigameResult.winnerId)
      if (!winner) {
        return res.status(400).json({ success: false, error: '小游戏获胜者不在活跃房客列表中', code: 'INVALID_WINNER' })
      }
      const { getAllGames } = require('../minigames/loadAll')
      const games = getAllGames()
      const game = games.find(g => g.id === minigameResult.minigameId)
      competitionType = 'minigame'
      competitionName = game ? `${game.name}` : '小游戏竞争'
    } else {
      winner = activeHouseguests[Math.floor(Math.random() * activeHouseguests.length)]
      competitionType = 'luck'
      competitionName = '运气挑战'
    }

    const hohCol = getCollection('BBHohRecord')
    await hohCol.deleteMany({ gameId: 'bigbrother', roundId: `round-${curRound}` })

    // 构建参与者排名（小游戏模式下带分数）
    const participants = activeHouseguests.map((h, i) => {
      const rank = h.id === winner.id ? 1 : (i + 2)
      const entry = { playerId: h.id, playerName: h.name, rank }
      if (minigameResult && minigameResult.scores && minigameResult.scores[h.id] !== undefined) {
        entry.score = minigameResult.scores[h.id]
      }
      return entry
    })

    const record = new BBHohRecord({
      id: generateId(),
      roundId: `round-${curRound}`,
      roundIndex: curRound,
      winnerId: winner.id,
      winnerName: winner.name,
      competitionType,
      competitionName,
      participants,
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
    await record.save()

    // Twist #28 毒蛇标记：为每位活跃玩家随机分配目标
    if (hasTwist(curRound, 'serpent_mark', twistConfigs, roundConfigs3)) {
      await applySerpentMarks(getCollection, curRound)
    }

    // Twist #32 受罚者：指定 4 人为受罚者
    if (hasTwist(curRound, 'condemned', twistConfigs, roundConfigs3)) {
      await applyCondemned(getCollection, season, winner.id)
    }

    res.json({ success: true, data: record.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: 'HOH 竞争失败', code: 'SERVER_ERROR' })
  }
})

// POST /assign - 手动指定 HOH
router.post('/assign', async (req, res) => {
  try {
    const { playerId, playerName } = req.body
    if (!playerId) return res.status(400).json({ success: false, error: '房客ID不能为空', code: 'INVALID_ID' })
    const houseguest = await BBHouseguest.findOne({ id: playerId })
    if (!houseguest) return res.status(404).json({ success: false, error: '房客不存在', code: 'NOT_FOUND' })
    const season = await getCurrentSeason()
    const curRound = season.currentRound
    const twistConfigs = season.twistConfigs || []
    const roundConfigs4 = season.roundConfigs || []

    await BBHohRecord.deleteMany({ gameId: 'bigbrother', roundId: `round-${curRound}` })
    const record = new BBHohRecord({
      id: generateId(),
      roundId: `round-${curRound}`,
      roundIndex: curRound,
      winnerId: houseguest.id,
      winnerName: houseguest.name,
      competitionType: 'manual',
      competitionName: '管理员指定',
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
    await record.save()

    const { getCollection } = require('../../../config/db')

    // Twist #28 毒蛇标记
    if (hasTwist(curRound, 'serpent_mark', twistConfigs, roundConfigs4)) {
      await applySerpentMarks(getCollection, curRound)
    }

    // Twist #32 受罚者
    if (hasTwist(curRound, 'condemned', twistConfigs, roundConfigs4)) {
      await applyCondemned(getCollection, season, houseguest.id)
    }

    res.json({ success: true, data: record.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置 HOH 失败', code: 'SERVER_ERROR' })
  }
})

// DELETE / - 清除当前 HOH
router.delete('/', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    await BBHohRecord.deleteMany({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    res.json({ success: true, data: null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '清除 HOH 失败', code: 'SERVER_ERROR' })
  }
})

// ===== Twist 辅助函数 =====

// #28 毒蛇标记：为每位活跃玩家随机分配一个目标
async function applySerpentMarks(getCollection, roundIndex) {
  try {
    const hgCol = getCollection('BBHouseguest')
    const serpentCol = getCollection('BBSerpentMark')
    const activePlayers = await hgCol.find({ gameId: 'bigbrother', status: 'active', role: 'houseguest' }).toArray()
    if (activePlayers.length < 2) return

    // 清除旧标记
    await serpentCol.deleteMany({ gameId: 'bigbrother', roundIndex })

    // 为每个玩家随机分配目标（不能是自己）
    const ids = activePlayers.map(p => p.id)
    const shuffled = [...ids]
    // Fisher-Yates shuffle
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    // 确保没有自己指向自己
    for (let i = 0; i < ids.length; i++) {
      if (shuffled[i] === ids[i]) {
        const next = (i + 1) % ids.length;
        [shuffled[i], shuffled[next]] = [shuffled[next], shuffled[i]]
      }
    }

    const marks = ids.map((playerId, i) => ({
      id: require('uuid').v4(),
      roundIndex,
      playerId,
      targetId: shuffled[i],
      targetName: activePlayers.find(p => p.id === shuffled[i])?.name || '',
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    }))
    await serpentCol.insertMany(marks)
  } catch (e) {
    console.error('applySerpentMarks error:', e)
  }
}

// #32 受罚者：指定 4 名非 HOH 的活跃玩家为受罚者
async function applyCondemned(getCollection, season, hohId) {
  try {
    const hgCol = getCollection('BBHouseguest')
    const nonHohPlayers = await hgCol.find({
      gameId: 'bigbrother',
      status: 'active',
      role: 'houseguest',
      id: { $ne: hohId }
    }).toArray()
    if (nonHohPlayers.length === 0) return

    // 随机选 4 人（或全部如果不够 4 人）
    const shuffled = [...nonHohPlayers].sort(() => Math.random() - 0.5)
    const condemnedCount = Math.min(4, shuffled.length)
    const condemned = shuffled.slice(0, condemnedCount)
    const condemnedIds = condemned.map(p => p.id)
    const condemnedNames = condemned.map(p => p.name)

    // 存储在 HOH 记录中
    const hohCol = getCollection('BBHohRecord')
    await hohCol.updateOne(
      { gameId: 'bigbrother', roundId: `round-${season.currentRound}` },
      { $set: { condemned: condemned.map(p => ({ playerId: p.id, playerName: p.name })), updatedAt: new Date().toISOString() } }
    )
  } catch (e) {
    console.error('applyCondemned error:', e)
  }
}

module.exports = router
