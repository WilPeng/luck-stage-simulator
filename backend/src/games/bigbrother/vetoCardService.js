/**
 * POV 抽卡服务（发牌 / 翻牌）
 * 供 REST 路由与 WebSocket 事件共用，保证管理端/选手端实时同步、无需刷新。
 */
const BBVetoRecord = require('./models/BBVetoRecord')
const BBHouseguest = require('./models/BBHouseguest')
const { generateId, getCurrentSeason } = require('./helpers')
const { broadcastBBGame } = require('../../socket/bbGame')

function shuffleArr(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function publicCardState(cd) {
  if (!cd) return null
  return {
    cards: (cd.cards || []).map(c => ({
      id: c.id,
      flipped: c.flipped,
      playerId: c.flipped ? c.playerId : null,
      playerName: c.flipped ? c.playerName : null,
      avatar: c.flipped ? c.avatar : null,
      drawnBy: c.drawnBy || null
    })),
    drawerOrder: cd.drawerOrder || [],
    drawerIndex: cd.drawerIndex || 0,
    needDraw: cd.needDraw || 0,
    participants: cd.participants || [],
    canPick: cd.canPick || [],
    pickablePlayers: cd.pickablePlayers || [],
    finished: (cd.drawerIndex || 0) >= (cd.drawerOrder || []).length
  }
}

// 发牌：所有房客背面朝上，确定抽卡顺序
async function dealVetoCards() {
  try {
    const { getCollection } = require('../../config/db')
    const season = await getCurrentSeason()
    if (season.currentStage !== 'veto_competition') {
      return { success: false, error: '当前不是否决权竞争阶段' }
    }
    const roundId = `round-${season.currentRound}`
    const allActive = await BBHouseguest.find({ gameId: 'bigbrother', status: 'active', role: 'houseguest' })
    if (allActive.length <= 6) {
      return { success: false, error: '存活人数≤6，无需抽卡（请使用普通抽取）' }
    }
    const hohCol = getCollection('BBHohRecord')
    const nomCol = getCollection('BBNomination')
    const hoh = await hohCol.findOne({ gameId: 'bigbrother', roundId })
    const nom = await nomCol.findOne({ gameId: 'bigbrother', roundId })
    const hohId = hoh?.winnerId || null
    const nomineeIds = nom?.nomineeIds || []
    const defaultIds = new Set([hohId, ...nomineeIds].filter(Boolean))
    const needDraw = Math.max(0, 6 - defaultIds.size)

    let drawerOrder = []
    if (nomineeIds.length >= 3) {
      for (let i = 0; i < needDraw; i++) drawerOrder.push({ playerId: hohId, playerName: hoh?.winnerName || '', role: 'hoh' })
    } else {
      drawerOrder.push({ playerId: hohId, playerName: hoh?.winnerName || '', role: 'hoh' })
      for (const id of nomineeIds) {
        const g = allActive.find(x => x.id === id)
        drawerOrder.push({ playerId: id, playerName: g?.name || '', role: 'nominee' })
      }
      drawerOrder = drawerOrder.slice(0, needDraw)
    }

    const cards = shuffleArr(allActive).map(h => ({
      id: generateId(), playerId: h.id, playerName: h.name, avatar: h.avatar || null, flipped: false, drawnBy: null
    }))
    const participants = allActive.filter(h => defaultIds.has(h.id)).map(h => ({
      playerId: h.id, playerName: h.name, avatar: h.avatar || null, source: 'default'
    }))
    const cardDraw = { cards, drawerOrder, drawerIndex: 0, needDraw, participants, canPick: [], pickablePlayers: [] }

    await BBVetoRecord.deleteMany({ gameId: 'bigbrother', roundId })
    const record = new BBVetoRecord({
      id: generateId(), roundId, roundIndex: season.currentRound,
      winnerId: null, winnerName: '', used: false, status: 'pending',
      participants, cardDraw, gameId: 'bigbrother', createdAt: new Date().toISOString()
    })
    await record.save()
    const state = publicCardState(cardDraw)
    broadcastBBGame('bb:veto-card', { roundId, cardDraw: state })
    return { success: true, data: state, roundId }
  } catch (e) {
    console.error(e)
    return { success: false, error: '发牌失败' }
  }
}

// 翻牌：当前抽卡者翻一张牌
async function drawVetoCard(userId, isAdmin) {
  try {
    const season = await getCurrentSeason()
    const roundId = `round-${season.currentRound}`
    const record = await BBVetoRecord.findOne({ gameId: 'bigbrother', roundId })
    if (!record || !record.cardDraw) return { success: false, error: '尚未发牌' }
    const cd = record.cardDraw
    const drawer = (cd.drawerOrder || [])[cd.drawerIndex]
    if (!drawer) return { success: false, error: '抽卡已结束' }
    if (!isAdmin && userId !== drawer.playerId) {
      return { success: false, error: '还没轮到你抽卡' }
    }
    const card = (cd.cards || []).find(c => !c.flipped)
    if (!card) return { success: false, error: '没有可翻的卡' }
    card.flipped = true
    card.drawnBy = drawer.playerId

    const { getCollection } = require('../../config/db')
    const hohCol = getCollection('BBHohRecord')
    const nomCol = getCollection('BBNomination')
    const hoh = await hohCol.findOne({ gameId: 'bigbrother', roundId })
    const nom = await nomCol.findOne({ gameId: 'bigbrother', roundId })
    const hohId = hoh?.winnerId || null
    const nomineeIds = nom?.nomineeIds || []

    const already = (cd.participants || []).find(p => p.playerId === card.playerId)
    if (already) {
      // 抽到 HOH / 被提名者（已在默认参与者中）：该人可自选其他房客加入 POV
      already.selfPickEligible = true
      const role = card.playerId === hohId ? 'hoh' : (nomineeIds.includes(card.playerId) ? 'nominee' : already.role || 'default')
      already.role = role
      cd.canPick = cd.canPick || []
      if (!cd.canPick.find(p => p.playerId === card.playerId)) {
        cd.canPick.push({ playerId: card.playerId, playerName: card.playerName, role })
      }
    } else {
      cd.participants.push({ playerId: card.playerId, playerName: card.playerName, avatar: card.avatar, source: 'drawn' })
    }
    cd.drawerIndex++
    if (cd.drawerIndex >= (cd.drawerOrder || []).length) {
      const allActive = await BBHouseguest.find({ gameId: 'bigbrother', status: 'active', role: 'houseguest' })
      const participantIds = new Set((cd.participants || []).map(p => p.playerId))
      cd.pickablePlayers = allActive.filter(h => !participantIds.has(h.id)).map(h => ({ playerId: h.id, playerName: h.name }))
    }
    record.participants = cd.participants
    record.cardDraw = cd
    record.updatedAt = new Date().toISOString()
    await record.save()
    const state = publicCardState(cd)
    broadcastBBGame('bb:veto-card', { roundId, cardDraw: state })
    return { success: true, data: state, flipped: { playerId: card.playerId, playerName: card.playerName }, roundId }
  } catch (e) {
    console.error(e)
    return { success: false, error: '抽卡失败' }
  }
}

module.exports = { dealVetoCards, drawVetoCard, publicCardState }
