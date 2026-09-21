const express = require('express')
const router = express.Router()
const BBNomination = require('../models/BBNomination')
const BBHouseguest = require('../models/BBHouseguest')
const { auth } = require('../../../middleware/auth')
const { broadcastBBGame } = require('../../../socket/bbGame')
const { postRoomMessage } = require('../../../socket/bbHouse')
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
          bbbbWinnerId: doc.bbbbWinnerId || null,
          bbbbWinnerName: doc.bbbbWinnerName || '',
          keyCeremony: doc.keyCeremony || null,
          vetoUsed: doc.vetoUsed || false,
          gameId: 'bigbrother',
          createdAt: doc.createdAt || new Date().toISOString(),
          updatedAt: doc.updatedAt || '',
          // twist 信息
          isDirectDemocracy: hasTwist(season.currentRound, 'direct_democracy', season.twistConfigs, roundConfigs),
          isTripleOffering: hasTwist(season.currentRound, 'triple_offering', season.twistConfigs, roundConfigs),
          isBbbb: hasTwist(season.currentRound, 'bbbb', season.twistConfigs, roundConfigs),
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
          isBbbb: hasTwist(season.currentRound, 'bbbb', season.twistConfigs, roundConfigs),
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

    // Twist #38 三重献祭 / BBBB：允许 2-3 人
    const isTriple = hasTwist(curRound, 'triple_offering', twistConfigs, roundConfigs)
    const isBbbb = hasTwist(curRound, 'bbbb', twistConfigs, roundConfigs)
    const minNominees = 2
    const maxNominees = (isTriple || isBbbb) ? 3 : 2

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

// POST /bbbb-winner - BBBB 比赛胜者（安全，不进入淘汰投票）
router.post('/bbbb-winner', auth, async (req, res) => {
  try {
    const { playerId, playerName } = req.body
    if (!playerId) return res.status(400).json({ success: false, error: '缺少玩家' })
    const season = await getCurrentSeason()
    if (season.currentStage !== 'bbbb') {
      return res.status(400).json({ success: false, error: '当前不是 BBBB 阶段', code: 'WRONG_STAGE' })
    }
    const roundId = `round-${season.currentRound}`
    const doc = await BBNomination.findOne({ gameId: 'bigbrother', roundId })
    if (!doc) return res.status(404).json({ success: false, error: '本轮提名不存在' })
    if (!doc.nomineeIds.includes(playerId)) {
      return res.status(400).json({ success: false, error: '该玩家不是本轮被提名人' })
    }
    doc.bbbbWinnerId = playerId
    doc.bbbbWinnerName = playerName || ''
    // BBBB 胜者不再是本轮终极提名：从提名名单中移除，安全、不可被投票、可参与投票
    const pairs = (doc.nomineeIds || []).map((id, i) => ({ id, name: (doc.nomineeNames || [])[i] }))
    const remaining = pairs.filter(p => p.id !== playerId)
    doc.nomineeIds = remaining.map(p => p.id)
    doc.nomineeNames = remaining.map(p => p.name)
    // 若胜者正是替换提名人，清空替换提名，确保其可参与淘汰投票
    if (doc.replacementNomineeId === playerId) {
      doc.replacementNomineeId = null
      doc.replacementNomineeName = ''
    }
    doc.updatedAt = new Date().toISOString()
    await doc.save()
    try {
      await logAction(req.user?.userId || null, req.user?.name || 'admin', req.user?.role || 'admin',
        BB_ACTION_TYPES.NOMINATION_SET, 'season', season.id,
        `BBBB 胜者（安全）：${playerName || playerId}`)
    } catch (logErr) {
      console.error('[BBBB] logAction failed:', logErr)
    }
    broadcastBBGame('bb:update', { path: '/api/bigbrother/nomination/bbbb-winner', method: 'POST' })
    res.json({ success: true, data: { playerId, playerName: playerName || '' } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置 BBBB 胜者失败', code: 'SERVER_ERROR' })
  }
})

// POST /key-setup - HOH 先选出被提名者，再安排其余（安全）选手的揭晓顺序
router.post('/key-setup', auth, async (req, res) => {
  try {
    const { nominees, order } = req.body || {}
    const season = await getCurrentSeason()
    if (season.currentStage !== 'nomination') {
      return res.status(400).json({ success: false, error: '当前不是提名阶段', code: 'WRONG_STAGE' })
    }
    const roundId = `round-${season.currentRound}`
    const { getCollection } = require('../../../config/db')
    const hoh = await getCollection('BBHohRecord').findOne({ gameId: 'bigbrother', roundId })
    const hohId = hoh?.winnerId || null
    const isAdmin = req.user?.role === 'admin'
    if (!isAdmin && req.user?.userId !== hohId) {
      return res.status(403).json({ success: false, error: '只有 HOH 或管理员可以设置提名仪式' })
    }
    const active = await BBHouseguest.find({ gameId: 'bigbrother', status: 'active', role: 'houseguest' })
    const eligible = active.filter(g => g.id !== hohId)
    if (!Array.isArray(nominees) || nominees.length < 2 || nominees.length > 3) {
      return res.status(400).json({ success: false, error: '被提名者应为 2-3 人', code: 'INVALID_NOMINEES' })
    }
    const eligibleIds = new Set(eligible.map(g => g.id))
    const nomineeSet = new Set(nominees)
    if (nominees.some(id => !eligibleIds.has(id))) {
      return res.status(400).json({ success: false, error: '被提名者包含无效玩家', code: 'INVALID_NOMINEES' })
    }
    const expectedOrder = eligible.filter(g => !nomineeSet.has(g.id)).map(g => g.id)
    if (!Array.isArray(order) || order.length !== expectedOrder.length) {
      return res.status(400).json({ success: false, error: `安全钥匙数量应为 ${expectedOrder.length} 把`, code: 'INVALID_ORDER' })
    }
    const orderSet = new Set(order)
    if (order.length !== orderSet.size || order.some(id => !eligibleIds.has(id) || nomineeSet.has(id))) {
      return res.status(400).json({ success: false, error: '安全顺序包含无效玩家', code: 'INVALID_ORDER' })
    }
    const nameOf = id => (active.find(g => g.id === id) || {}).name || ''
    await BBNomination.deleteMany({ gameId: 'bigbrother', roundId })
    const doc = new BBNomination({
      id: generateId(),
      roundId,
      roundIndex: season.currentRound,
      nomineeIds: [...nominees],
      nomineeNames: nominees.map(nameOf),
      hohId,
      hohName: hoh?.winnerName || '',
      keyCeremony: {
        active: true,
        hohId,
        hohName: hoh?.winnerName || '',
        eligible: eligible.map(g => ({ playerId: g.id, playerName: g.name })),
        nominees: nominees.map(id => ({ playerId: id, playerName: nameOf(id) })),
        order: order.map(id => ({ playerId: id, playerName: nameOf(id) })),
        drawnCount: 0,
        announcedCount: 0,
        messages: []
      },
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
    await doc.save()
    broadcastBBGame('bb:key-ceremony', { roundId, keyCeremony: doc.keyCeremony, nomineeIds: doc.nomineeIds, nomineeNames: doc.nomineeNames })
    res.json({ success: true, data: doc.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置提名仪式失败', code: 'SERVER_ERROR' })
  }
})

// POST /key-draw - 当前抽钥匙者抽出一把钥匙（HOH → 上一位安全选手）
router.post('/key-draw', auth, async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const roundId = `round-${season.currentRound}`
    const doc = await BBNomination.findOne({ gameId: 'bigbrother', roundId })
    if (!doc || !doc.keyCeremony) return res.status(400).json({ success: false, error: '尚未开始钥匙仪式' })
    const kc = doc.keyCeremony
    if ((kc.drawnCount || 0) >= kc.order.length) {
      return res.status(400).json({ success: false, error: '钥匙已抽完' })
    }
    if ((kc.announcedCount || 0) < (kc.drawnCount || 0)) {
      return res.status(400).json({ success: false, error: '请先宣布上一位安全选手', code: 'PENDING_ANNOUNCE' })
    }
    const drawerId = (kc.drawnCount || 0) === 0 ? kc.hohId : kc.order[kc.drawnCount - 1].playerId
    const isAdmin = req.user?.role === 'admin'
    if (!isAdmin && req.user?.userId !== drawerId) {
      return res.status(403).json({ success: false, error: '还没轮到你抽钥匙' })
    }
    kc.drawnCount = (kc.drawnCount || 0) + 1
    doc.keyCeremony = kc
    doc.updatedAt = new Date().toISOString()
    await doc.save()
    broadcastBBGame('bb:key-ceremony', { roundId, keyCeremony: kc, nomineeIds: doc.nomineeIds, nomineeNames: doc.nomineeNames })
    res.json({ success: true, data: doc.toObject(), revealed: kc.order[kc.drawnCount - 1] })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '抽钥匙失败', code: 'SERVER_ERROR' })
  }
})

// POST /key-announce - 抽钥匙者宣布安全（发一条聊天消息）
router.post('/key-announce', auth, async (req, res) => {
  try {
    const { text } = req.body || {}
    const season = await getCurrentSeason()
    const roundId = `round-${season.currentRound}`
    const doc = await BBNomination.findOne({ gameId: 'bigbrother', roundId })
    if (!doc || !doc.keyCeremony) return res.status(400).json({ success: false, error: '尚未开始钥匙仪式' })
    const kc = doc.keyCeremony
    if ((kc.announcedCount || 0) >= (kc.drawnCount || 0)) {
      return res.status(400).json({ success: false, error: '暂无可宣布的钥匙' })
    }
    const keyIndex = kc.announcedCount || 0
    const drawerId = keyIndex === 0 ? kc.hohId : kc.order[keyIndex - 1].playerId
    const drawerName = keyIndex === 0 ? kc.hohName : (kc.order[keyIndex - 1]?.playerName || '')
    const isAdmin = req.user?.role === 'admin'
    if (!isAdmin && req.user?.userId !== drawerId) {
      return res.status(403).json({ success: false, error: '只有抽钥匙者可以宣布' })
    }
    const revealed = kc.order[keyIndex]
    const msg = text && String(text).trim() ? String(text).trim() : `${revealed.playerName}, you're safe.`
    kc.messages = kc.messages || []
    kc.messages.push({ playerId: drawerId, playerName: drawerName, text: msg, safeId: revealed.playerId, safeName: revealed.playerName, at: new Date().toISOString() })
    kc.announcedCount = (kc.announcedCount || 0) + 1
    if (kc.announcedCount >= kc.order.length) kc.active = false
    doc.keyCeremony = kc
    doc.updatedAt = new Date().toISOString()
    await doc.save()
    // 同步到餐厅聊天记录（提名仪式在餐厅进行）
    await postRoomMessage('dining_room', { senderId: drawerId, senderName: drawerName, content: msg })
    broadcastBBGame('bb:key-ceremony', { roundId, keyCeremony: kc, nomineeIds: doc.nomineeIds, nomineeNames: doc.nomineeNames })
    res.json({ success: true, data: doc.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '宣布失败', code: 'SERVER_ERROR' })
  }
})

// POST /key-speech - HOH 开场/结束发言（开场：仪式开始前；结束：全部钥匙抽完后）
router.post('/key-speech', auth, async (req, res) => {
  try {
    const { phase, text, reason, nomineeOrder } = req.body || {}
    const season = await getCurrentSeason()
    const roundId = `round-${season.currentRound}`
    const doc = await BBNomination.findOne({ gameId: 'bigbrother', roundId })
    if (!doc || !doc.keyCeremony) return res.status(400).json({ success: false, error: '尚未开始钥匙仪式' })
    const kc = doc.keyCeremony
    const isAdmin = req.user?.role === 'admin'
    if (!isAdmin && req.user?.userId !== kc.hohId) {
      return res.status(403).json({ success: false, error: '只有 HOH 可以发言' })
    }
    const n = (kc.nominees || []).length

    // 开场/结束发言各只可发送一次
    if (phase === 'opening' && kc.openingSpoken) {
      return res.status(400).json({ success: false, error: '开场发言已发表', code: 'ALREADY_SPOKEN' })
    }
    if (phase === 'closing' && (kc.closingSpoken || kc.ended)) {
      return res.status(400).json({ success: false, error: '结束发言已发表', code: 'ALREADY_SPOKEN' })
    }

    // 结束发言：允许房主指定提名顺序
    if (phase === 'closing' && Array.isArray(nomineeOrder) && nomineeOrder.length) {
      const map = {}
      ;(kc.nominees || []).forEach(x => { map[x.playerId] = x })
      const reordered = nomineeOrder.map(id => map[id]).filter(Boolean)
      ;(kc.nominees || []).forEach(x => { if (!nomineeOrder.includes(x.playerId)) reordered.push(x) })
      kc.nominees = reordered
      doc.nomineeIds = reordered.map(x => x.playerId)
      doc.nomineeNames = reordered.map(x => x.playerName)
    }

    let content = text && String(text).trim() ? String(text).trim() : ''
    if (!content) {
      const names = (kc.nominees || []).map(x => x.playerName).join('、')
      if (phase === 'opening') {
        content = `现在是提名仪式。作为房主，我有权利提名${n}位房客候选淘汰。我将从箱子中逐个抽出钥匙，最后没有获得钥匙的房客将成为本轮的淘汰候选。`
      } else {
        content = `我选择提名的房客分别是${names}${reason ? `，原因是${reason}` : '，原因是……'}。提名仪式到此结束。`
      }
    }

    kc.messages = kc.messages || []
    kc.messages.push({ playerId: kc.hohId, playerName: kc.hohName, text: content, type: phase || 'speech', at: new Date().toISOString() })
    // 结束发言即宣布提名仪式结束
    if (phase === 'closing') { kc.closingSpoken = true; kc.ended = true }
    if (phase === 'opening') kc.openingSpoken = true
    doc.keyCeremony = kc
    doc.updatedAt = new Date().toISOString()
    await doc.save()
    // 同步到餐厅聊天记录
    await postRoomMessage('dining_room', { senderId: kc.hohId, senderName: kc.hohName, content })
    broadcastBBGame('bb:key-ceremony', { roundId, keyCeremony: kc, nomineeIds: doc.nomineeIds, nomineeNames: doc.nomineeNames })
    res.json({ success: true, data: doc.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '发言失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
