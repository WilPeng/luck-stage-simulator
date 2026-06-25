const express = require('express')
const router = express.Router()
const { auth, requireAdmin } = require('../middleware/auth')
const { generateId, logAction, getCurrentSeason, ACTION_TYPES, randomInt } = require('../utils/helpers')
const Season = require('../models/Season')
const Round = require('../models/Round')
const RoundTeam = require('../models/RoundTeam')
const RoundTeamMember = require('../models/RoundTeamMember')
const TeamSong = require('../models/TeamSong')
const Song = require('../models/Song')
const User = require('../models/User')
const TeamPerformance = require('../models/TeamPerformance')
const PlayerPerformance = require('../models/PlayerPerformance')
const RehearsalResult = require('../models/RehearsalResult')
const StageEvent = require('../models/StageEvent')
const { generateAudienceVoteForRound } = require('../services/audienceVoteService')
const PerformanceValue = require('../models/PerformanceValue')
const PerformanceRoundState = require('../models/PerformanceRoundState')
const AudienceVoteFinalRanking = require('../models/AudienceVoteFinalRanking')

// ====================== 工具函数 ======================

/**
 * 解析轮次信息（支持 roundId / roundIndex / round 参数）
 * roundId 格式: "round-1" 或 "round_1" → 提取 index
 * roundIndex / round 格式: 1
 * 优先从 Round 表查找，找不到则自动创建
 */
async function resolveRound(req) {
  const { roundId, roundIndex, round } = req.body
  const qRoundIdx = parseInt(roundIndex ?? round ?? req.query.roundIndex ?? req.query.round)
  if (roundId) {
    const r = await Round.findOne({ id: roundId })
    if (r) return r
    // fallback: 从 roundId 中提取 index（如 "round-1" → 1）
    const match = roundId.match(/^round[_-](\d+)$/)
    if (match) {
      const idx = parseInt(match[1])
      const season = await getCurrentSeason()
      if (season) {
        const r2 = await Round.findOne({ seasonId: season.id, index: idx })
        if (r2) return r2
        // 兼容 seed 数据中 roundIndex 字段名错误的情况
        const r3 = await Round.findOne({ seasonId: season.id, roundIndex: idx })
        if (r3) { r3.index = idx; await r3.save(); return r3 }
        // 创建新 Round
        const newRound = new Round({
          id: generateId(), seasonId: season.id, index: idx,
          stage: 'performance', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        })
        await newRound.save()
        return newRound
      }
      return { id: roundId, index: idx, stage: 'performance' }
    }
  }
  if (!isNaN(qRoundIdx)) {
    const season = await getCurrentSeason()
    if (season) {
      const r = await Round.findOne({ seasonId: season.id, index: qRoundIdx })
      if (r) return r
      const newRound = new Round({
        id: generateId(), seasonId: season.id, index: qRoundIdx,
        stage: 'performance', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      })
      await newRound.save()
      return newRound
    }
  }
  return null
}

async function resolveRoundFromQuery(req) {
  const { roundId, roundIndex, round } = req.query
  const qRoundIdx = parseInt(roundIndex ?? round)
  if (roundId) {
    const r = await Round.findOne({ id: roundId })
    if (r) return r
    // fallback: 从 roundId 中提取 index（如 "round-1" → 1）
    const match = roundId.match(/^round[_-](\d+)$/)
    if (match) {
      const idx = parseInt(match[1])
      const season = await getCurrentSeason()
      if (season) {
        let r2 = await Round.findOne({ seasonId: season.id, index: idx })
        if (r2) return r2
        // 兼容 seed 数据中 roundIndex 字段名错误的情况
        r2 = await Round.findOne({ seasonId: season.id, roundIndex: idx })
        if (r2) { r2.index = idx; await r2.save(); return r2 }
      }
      return { id: `round-${idx}`, index: idx, stage: 'performance' }
    }
  }
  if (!isNaN(qRoundIdx)) {
    const season = await getCurrentSeason()
    if (season) {
      let r = await Round.findOne({ seasonId: season.id, index: qRoundIdx })
      if (r) return r
      // 兼容 seed 数据中 roundIndex 字段名错误的情况
      r = await Round.findOne({ seasonId: season.id, roundIndex: qRoundIdx })
      if (r) { r.index = qRoundIdx; await r.save(); return r }
      // fallback: 构造虚拟轮次
      return { id: `round-${qRoundIdx}`, index: qRoundIdx, stage: 'performance' }
    }
  }
  // 最后兜底：自动取当前赛季的当前轮次
  const season = await getCurrentSeason()
  if (season) {
    let r = await Round.findOne({ seasonId: season.id, index: season.currentRound })
    if (r) return r
    r = await Round.findOne({ seasonId: season.id, roundIndex: season.currentRound })
    if (r) { r.index = season.currentRound; await r.save(); return r }
    return { id: `round-${season.currentRound}`, index: season.currentRound, stage: 'performance' }
  }
  return null
}

// ===== 共用工具：发挥值文案映射（修正为 -10~40 范围）=====
function getPerformanceText(value) {
  if (value >= 30) return '超神发挥'
  if (value >= 15) return '超常发挥'
  if (value >= 5) return '优秀发挥'
  if (value >= -2) return '正常发挥'
  if (value >= -7) return '略有失误'
  return '发挥失常'
}

// ===== 共用工具：生成并保存发挥值 =====
async function createPerformanceValue({ roundId, roundIndex, playerId, teamId, value }) {
  const pv = new PerformanceValue({
    id: generateId(),
    roundId,
    roundIndex,
    playerId,
    teamId,
    performanceValue: value,
    generatedAt: new Date().toISOString()
  })
  await pv.save()
  return pv
}

function buildRoundFilter(round) {
  const filter = {}
  if (!round) return filter
  if (round.id) filter.roundId = round.id
  if (typeof round.index === 'number') filter.roundIndex = round.index
  return filter
}

// ====================== GET /api/performance - 按轮次获取公演结果 ======================

router.get('/', auth, async (req, res) => {
  try {
    const round = await resolveRoundFromQuery(req)
    const filter = buildRoundFilter(round)
    const [teamPerf, playerPerf] = await Promise.all([
      TeamPerformance.find(filter),
      PlayerPerformance.find(filter)
    ])
    // 兼容 roundId 格式不一致：同时查 round.id（UUID）和 front format（round-1）
    const roundIdFilter = round && round.id ? { $or: [{ roundId: filter.roundId }, { roundId: req.query.roundId }, round.index ? { roundIndex: round.index } : {}].filter(c => c && Object.keys(c).length > 0) } : { roundId: filter.roundId }
    const teams = await RoundTeam.find(roundIdFilter)
    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u
    const teamMap = {}
    for (const t of teams) teamMap[t.id] = t

    const teamsData = teamPerf.map(tp => {
      const o = tp.toObject()
      delete o._id
      return { ...o, teamName: o.teamName || (teamMap[tp.teamId]?.name) || null, songName: o.songName || null, teamIndex: teamMap[tp.teamId]?.index ?? null }
    }).sort((a, b) => (a.rank || 999) - (b.rank || 999))

    const playersData = playerPerf.map(pp => {
      const o = pp.toObject()
      delete o._id
      return { ...o, playerName: o.playerName || (userMap[pp.playerId]?.name) || null, teamName: o.teamName || (teamMap[pp.teamId]?.name) || null }
    }).sort((a, b) => (a.rank || 999) - (b.rank || 999))

    // 查询本轮公演是否已开启过
    const state = round ? await PerformanceRoundState.findOne({ roundId: round.id }) : null
    const started = state ? state.started : false

    res.json({ success: true, data: { roundId: filter.roundId || null, roundIndex: filter.roundIndex ?? null, started, teams: teamsData, players: playersData, summary: { teamCount: teamsData.length, playerCount: playersData.length, topTeam: teamsData[0] || null, topPlayer: playersData[0] || null } } })
  } catch (e) {
    console.error('Get performance error:', e)
    res.status(500).json({ success: false, error: '获取公演结果失败', code: 'SERVER_ERROR' })
  }
})

// ====================== GET /api/performance/summary ======================

router.get('/summary', auth, async (req, res) => {
  try {
    const round = await resolveRoundFromQuery(req)
    const filter = buildRoundFilter(round)
    const [teamPerf, playerPerf] = await Promise.all([TeamPerformance.find(filter), PlayerPerformance.find(filter)])
    teamPerf.sort((a, b) => (a.rank || 999) - (b.rank || 999))
    playerPerf.sort((a, b) => (a.rank || 999) - (b.rank || 999))
    const avgTeamScore = teamPerf.length ? teamPerf.reduce((s, t) => s + (t.finalVotes || t.finalScore || 0), 0) / teamPerf.length : 0
    res.json({ success: true, data: { teamCount: teamPerf.length, playerCount: playerPerf.length, topTeam: teamPerf[0] || null, topPlayer: playerPerf[0] || null, avgTeamScore, roundId: filter.roundId || null, roundIndex: filter.roundIndex ?? null } })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取统计失败', code: 'SERVER_ERROR' })
  }
})

// ====================== GET /api/performance/config ======================

router.get('/config', auth, async (req, res) => {
  try {
    const season = await getCurrentSeason()
    res.json({ success: true, data: { baseScore: season?.baseScore || 100, scoreMultiplier: season?.scoreMultiplier || 1, randomMin: season?.randomMin || 0, randomMax: season?.randomMax || 10, teamRankBonusBase: season?.teamRankBonusBase || 0, teamRankBonusMultiplier: season?.teamRankBonusMultiplier || 1, teamRandomMin: season?.teamRandomMin || -5, teamRandomMax: season?.teamRandomMax || 15 } })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取配置失败', code: 'SERVER_ERROR' })
  }
})

// ====================== PUT /api/performance/config ======================

router.put('/config', auth, requireAdmin, async (req, res) => {
  try {
    let season = await getCurrentSeason()
    if (!season) { season = new Season({ id: generateId(), name: '乘风2026', currentStage: 'preparation', currentRound: 1, totalRounds: 3 }) }
    const fields = ['baseScore', 'scoreMultiplier', 'randomMin', 'randomMax', 'teamRankBonusBase', 'teamRankBonusMultiplier', 'teamRandomMin', 'teamRandomMax']
    for (const f of fields) { if (req.body[f] !== undefined) season[f] = req.body[f] }
    await season.save()
    res.json({ success: true, data: { ...season.toObject(), _id: undefined } })
  } catch (e) {
    res.status(500).json({ success: false, error: '更新配置失败', code: 'SERVER_ERROR' })
  }
})

// ====================== 评级工具函数 ======================

/** 根据分数返回评级和描述 */
function getStageRating(score) {
  if (score >= 85) return { stageRating: 'S', stageRatingText: '完美舞台' }
  if (score >= 65) return { stageRating: 'A', stageRatingText: '出色表现' }
  if (score >= 45) return { stageRating: 'B', stageRatingText: '稳定发挥' }
  if (score >= 25) return { stageRating: 'C', stageRatingText: '略有不足' }
  return { stageRating: 'D', stageRatingText: '失误较多' }
}

/** 计算机个人分和评级 (带控制台日志) */
function calcPlayerScore(player, song, performanceValue) {
  // 归一化歌曲权重
  const totalWeight = song.vocalWeight + song.danceWeight + song.charmWeight
  const normalizedVocalW = +(song.vocalWeight / totalWeight).toFixed(4)
  const normalizedDanceW = +(song.danceWeight / totalWeight).toFixed(4)
  const normalizedCharmW = +(song.charmWeight / totalWeight).toFixed(4)

  // ★ BUG 修复: 属性从 player.attributes 中读取，不是 player 顶层 ★
  const rawVocal = player.attributes?.vocal ?? 0
  const rawDance = player.attributes?.dance ?? 0
  const rawCharm = player.attributes?.charm ?? 0

  // 属性分 0~100
  const attributeScore = Math.round(
    rawVocal * normalizedVocalW +
    rawDance * normalizedDanceW +
    rawCharm * normalizedCharmW
  )

  // 难度系数 difficulty=1→1.0, difficulty=5→0.6
  const difficultyFactor = +(1 - (song.difficulty - 1) * 0.1).toFixed(2)

  // 发挥加成 = 发挥值 × 2 （-20~80）
  const performanceBonus = performanceValue * 2

  // 最终分数 0~120
  const rawScore = attributeScore * difficultyFactor + performanceBonus
  let playerFinalScore = Math.round(rawScore)
  if (playerFinalScore < 0) playerFinalScore = 0
  if (playerFinalScore > 120) playerFinalScore = 120

  const { stageRating, stageRatingText } = getStageRating(playerFinalScore)

  // ===== 控制台详细计算日志 =====
  console.log('')
  console.log('╔══════════════════════════════════════════════╗')
  console.log(`║  个人得分计算 · ${player.name || player.playerId || '未知选手'}`)
  console.log(`║  歌曲: ${song.name} | 难度: ${song.difficulty}`)
  console.log(`║  权重: 声乐=${song.vocalWeight} 舞蹈=${song.danceWeight} 魅力=${song.charmWeight}`)
  console.log(`║  归一化: V=${normalizedVocalW} D=${normalizedDanceW} C=${normalizedCharmW}`)
  console.log(`║  选手属性: 声乐=${rawVocal} 舞蹈=${rawDance} 魅力=${rawCharm}`)
  console.log(`║  属性分 = ${rawVocal}×${normalizedVocalW} + ${rawDance}×${normalizedDanceW} + ${rawCharm}×${normalizedCharmW} = ${attributeScore}`)
  console.log(`║  难度系数 = 1 - (${song.difficulty} - 1)×0.1 = ${difficultyFactor}`)
  console.log(`║  发挥值 = ${performanceValue} → 发挥加成 = ${performanceValue}×2 = ${performanceBonus}`)
  console.log(`║  原始分 = ${attributeScore}×${difficultyFactor} + ${performanceBonus} = ${rawScore.toFixed(2)}`)
  console.log(`║  最终分 = ${playerFinalScore} → 评级: ${stageRating}(${stageRatingText})`)
  console.log('╚══════════════════════════════════════════════╝')

  return { playerScore: playerFinalScore, stageRating, stageRatingText, attributeScore, difficultyFactor, performanceBonus }
}

/** 计算团队分和团队评级（带控制台日志） */
function calcTeamScore(memberScores, teamName) {
  if (memberScores.length === 0) return { teamScore: 0, teamRating: 'D', teamRatingText: '失误较多' }
  const teamAvgScore = Math.round(memberScores.reduce((s, v) => s + v, 0) / memberScores.length)
  const teamBonus = Math.floor(Math.random() * 21) // 0~20
  const teamScore = teamAvgScore + teamBonus
  const { stageRating: teamRating, stageRatingText: teamRatingText } = getStageRating(teamScore)

  console.log('')
  console.log('╔══════════════════════════════════════════════╗')
  console.log(`║  团队得分计算 · ${teamName || '未知队伍'}`)
  console.log(`║  成员个人分: [${memberScores.join(', ')}]`)
  console.log(`║  团队平均分 = (${memberScores.join(' + ')}) / ${memberScores.length} = ${teamAvgScore}`)
  console.log(`║  团队加成(随机) = ${teamBonus}`)
  console.log(`║  团队总分 = ${teamAvgScore} + ${teamBonus} = ${teamScore}`)
  console.log(`║  最终票数 = 500 + ${teamScore}×3 + random(-10~20) = 500 + ${teamScore * 3} + random`)
  console.log(`║  评级: ${teamRating}(${teamRatingText})`)
  console.log('╚══════════════════════════════════════════════╝')

  return { teamScore, teamRating, teamRatingText, teamAvgScore, teamBonus }
}

// ====================== POST /api/performance/calculate - 公演结算（新评级体系） ======================

router.post('/calculate', auth, requireAdmin, async (req, res) => {
  try {
    const round = await resolveRound(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次（请传 roundId 或 roundIndex）', code: 'NO_ROUND' })

    const BASE_VOTES = 500

    // dbRoundId 用于存储到 TeamPerformance/PlayerPerformance（Round 的真实 id）
    // frontRoundId 用于查询 RoundTeam/RoundTeamMember/TeamSong（前端传入的 roundId 格式）
    const dbRoundId = round.id
    const frontRoundId = req.body.roundId || `round-${round.index}`

    const filter = buildRoundFilter(round)

    // 兼容 roundId 格式不一致：同时查 round.id（UUID）和 frontRoundId（round-1）
    const roundIdFilter = dbRoundId !== frontRoundId
      ? { $or: [{ roundId: dbRoundId }, { roundId: frontRoundId }] }
      : { roundId: dbRoundId }

    // 1. 队伍
    const teams = await RoundTeam.find(roundIdFilter)
    if (teams.length === 0) return res.status(400).json({ success: false, error: '该轮没有队伍，请先设置队伍', code: 'NO_TEAMS' })

    // 2. 歌曲分配
    const teamSongs = await TeamSong.find(roundIdFilter)
    const allSongs = await Song.find({})
    const songMap = {}
    for (const s of allSongs) songMap[s.id] = s
    const teamSongMap = {}
    for (const ts of teamSongs) teamSongMap[ts.teamId] = ts

    // 3. 成员
    const members = await RoundTeamMember.find(roundIdFilter)
    const membersByTeam = {}
    for (const m of members) {
      if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = []
      membersByTeam[m.teamId].push(m)
    }

    // 4. 选手信息
    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    // 5. 已生成的发挥值
    const performanceValues = await PerformanceValue.find({ roundId: dbRoundId })
    const perfValueMap = {}
    for (const pv of performanceValues) perfValueMap[pv.playerId] = pv.performanceValue

    // 6. 舞台事件池（保留用于 finalVotes 计算）
    const stageEvents = await StageEvent.find({ enabled: true })

    // 7. 清空旧结果（同时清理用 dbRoundId 和 frontRoundId 存的旧数据）
    await TeamPerformance.deleteMany({ roundId: { $in: [dbRoundId, frontRoundId] } })
    await PlayerPerformance.deleteMany({ roundId: { $in: [dbRoundId, frontRoundId] } })

    // ===== 8. 按新公式计算机个人分、团队分 =====
    const teamResults = []
    const allPlayerResults = []

    for (const team of teams) {
      const ts = teamSongMap[team.id]
      const song = ts ? songMap[ts.songId] : null
      if (!song) continue // 无歌曲则跳过

      const teamMembers = (membersByTeam[team.id] || []).filter(m => {
        const u = userMap[m.playerId]
        return u && u.status !== 'eliminated'
      })

      if (teamMembers.length === 0) continue

      // 计算每位成员的个人分
      const memberResults = []
      const memberScores = []
      for (const m of teamMembers) {
        const u = userMap[m.playerId]
        // 获取发挥值，未生成则随机补一个
        let perfValue = perfValueMap[m.playerId]
        if (perfValue === undefined) {
          perfValue = randomInt(-10, 40)
        }
        const { playerScore, stageRating, stageRatingText, attributeScore, difficultyFactor, performanceBonus } =
          calcPlayerScore(u, song, perfValue)

        memberResults.push({
          playerId: u.id,
          playerName: u.name,
          teamId: team.id,
          teamName: team.name,
          performanceValue: perfValue,
          playerScore,
          stageRating,
          stageRatingText,
          attributeScore,
          difficultyFactor,
          performanceBonus
        })
        memberScores.push(playerScore)
      }

      // 计算团队分
      const { teamScore, teamRating, teamRatingText, teamAvgScore, teamBonus } = calcTeamScore(memberScores, team.name)

      // 计算最终票数 = 500 + teamScore×3 + random(-10,20)
      const finalVotesRandom = randomInt(-10, 20)
      const finalVotes = BASE_VOTES + teamScore * 3 + finalVotesRandom

      // 舞台事件（保留原有逻辑）
      let eventVotes = 0
      let eventId = null
      let eventName = ''
      let eventDescription = ''
      if (stageEvents.length > 0) {
        const drawn = stageEvents[Math.floor(Math.random() * stageEvents.length)]
        eventVotes = drawn.voteEffect || 0
        eventId = drawn.id
        eventName = drawn.name
        eventDescription = drawn.description || ''
      }

      // 歌曲权重
      const vw = song.vocalWeight || 3
      const dw = song.danceWeight || 3
      const cw = song.charmWeight || 3

      // 团队平均属性
      const teamVocal = Math.round(memberResults.reduce((s, m) => s + (userMap[m.playerId]?.attributes?.vocal || 0), 0) / memberResults.length)
      const teamDance = Math.round(memberResults.reduce((s, m) => s + (userMap[m.playerId]?.attributes?.dance || 0), 0) / memberResults.length)
      const teamCharm = Math.round(memberResults.reduce((s, m) => s + (userMap[m.playerId]?.attributes?.charm || 0), 0) / memberResults.length)

      // 归一化歌曲权重
      const totalW = vw + dw + cw
      const normVW = totalW > 0 ? +(vw / totalW).toFixed(2) : 0.34
      const normDW = totalW > 0 ? +(dw / totalW).toFixed(2) : 0.33
      const normCW = totalW > 0 ? +(cw / totalW).toFixed(2) : 0.33

      teamResults.push({
        teamId: team.id,
        teamName: team.name,
        songId: song.id,
        songName: song.name,
        memberCount: teamMembers.length,
        baseVotes: BASE_VOTES,
        attributeVotes: teamScore * 3,
        performanceVotes: finalVotesRandom,
        compatibilityVotes: 0,
        eventVotes: teamBonus,
        finalVotes,
        finalScore: finalVotes, // 兼容旧字段
        rank: 0,
        status: 'calculated',
        teamScore,
        teamRating,
        teamRatingText,
        songWeights: { vocal: normVW, dance: normDW, charm: normCW },
        teamAttributes: { vocal: teamVocal, dance: teamDance, charm: teamCharm },
        songVocalWeight: vw,
        songDanceWeight: dw,
        songCharmWeight: cw,
        memberPerformances: memberResults.map(mr => ({
          playerId: mr.playerId,
          playerName: mr.playerName,
          performanceValue: mr.performanceValue,
          playerScore: mr.playerScore,
          stageRating: mr.stageRating,
          stageRatingText: mr.stageRatingText
        })),
        memberCount: teamMembers.length,
        eventId,
        eventName,
        eventDescription
      })

      // 队内排名
      memberResults.sort((a, b) => b.playerScore - a.playerScore)
      for (let i = 0; i < memberResults.length; i++) memberResults[i].rankInTeam = i + 1

      allPlayerResults.push(...memberResults)
    }

    // 队伍排名（按 finalVotes）
    teamResults.sort((a, b) => b.finalVotes - a.finalVotes)
    for (let i = 0; i < teamResults.length; i++) teamResults[i].rank = i + 1

    // 全场选手排名（按 playerScore）
    allPlayerResults.sort((a, b) => b.playerScore - a.playerScore)
    for (let i = 0; i < allPlayerResults.length; i++) allPlayerResults[i].rank = i + 1

    // ===== 9. 保存 =====
    const savedTeams = []
    for (const tr of teamResults) {
      const tp = new TeamPerformance({
        id: generateId(),
        roundId: dbRoundId,
        roundIndex: round.index,
        teamId: tr.teamId,
        songId: tr.songId,
        teamName: tr.teamName,
        songName: tr.songName,
        baseVotes: tr.baseVotes,
        attributeVotes: tr.attributeVotes || 0,
        performanceVotes: tr.performanceVotes || 0,
        compatibilityVotes: tr.compatibilityVotes || 0,
        teamScore: tr.teamScore,
        teamRating: tr.teamRating,
        teamRatingText: tr.teamRatingText,
        finalVotes: tr.finalVotes,
        finalScore: tr.finalVotes,
        eventVotes: tr.eventVotes,
        songVocalWeight: tr.songVocalWeight,
        songDanceWeight: tr.songDanceWeight,
        songCharmWeight: tr.songCharmWeight,
        avgVocal: tr.teamAttributes?.vocal || 0,
        avgDance: tr.teamAttributes?.dance || 0,
        avgCharm: tr.teamAttributes?.charm || 0,
        memberPerformances: tr.memberPerformances,
        rank: tr.rank,
        createdAt: new Date().toISOString()
      })
      await tp.save()
      savedTeams.push(tp)
    }

    const savedPlayers = []
    for (const pr of allPlayerResults) {
      const pp = new PlayerPerformance({
        id: generateId(),
        roundId: dbRoundId,
        roundIndex: round.index,
        playerId: pr.playerId,
        teamId: pr.teamId,
        playerName: pr.playerName,
        teamName: pr.teamName,
        performanceValue: pr.performanceValue,
        playerScore: pr.playerScore,
        stageRating: pr.stageRating,
        stageRatingText: pr.stageRatingText,
        rankInTeam: pr.rankInTeam,
        rank: pr.rank,
        createdAt: new Date().toISOString()
      })
      await pp.save()
      savedPlayers.push(pp)
    }

    // 生成大众评审个人喜爱度投票
    let audienceVoteResult = null
    try {
      audienceVoteResult = await generateAudienceVoteForRound(round)
    } catch (avErr) {
      console.error('Generate audience vote failed:', avErr)
    }

    try {
      await logAction(req.user.userId, req.user.name, req.user.role, ACTION_TYPES.PERFORMANCE_CALC || 'PERFORMANCE_CALC',
        'performance', round.id, `第 ${round.index} 轮公演结算完成（新评级体系）：${savedTeams.length} 团 / ${savedPlayers.length} 位选手`)
    } catch (logErr) { console.warn('log error ignored', logErr) }

    // 标记为已结算
    try {
      const state = await PerformanceRoundState.findOne({ roundId: dbRoundId })
      if (state) {
        state.started = true
        state.updatedAt = new Date().toISOString()
        await state.save()
      } else {
        const newState = new PerformanceRoundState({
          id: generateId(),
          roundId: dbRoundId,
          roundIndex: round.index,
          started: true,
          revealedTeamIds: []
        })
        await newState.save()
      }
    } catch (stateErr) { console.warn('Save settled state failed:', stateErr) }

    // 构造返回数据（对齐文档格式）
    const teamResultsData = savedTeams.map(t => {
      const o = t.toObject()
      delete o._id
      // 关联该队伍的选手数据
      const teamPlayerResults = savedPlayers
        .filter(p => p.teamId === o.teamId)
        .sort((a, b) => (a.rankInTeam || 999) - (b.rankInTeam || 999))

      // contribution = 选手个人分占全队总分比例
      const totalTeamScore = teamPlayerResults.reduce((s, p) => s + (p.playerScore || 0), 0) || 1

      return {
        roundId: o.roundId,
        teamId: o.teamId,
        teamName: o.teamName,
        songId: o.songId,
        songName: o.songName,
        memberCount: teamPlayerResults.length,
        baseVotes: o.baseVotes || 500,
        attributeVotes: o.attributeVotes || (o.teamScore || 0) * 3,
        performanceVotes: o.performanceVotes || 0,
        compatibilityVotes: o.compatibilityVotes || 0,
        eventVotes: o.teamBonus || 0,
        finalVotes: o.finalVotes || 0,
        rank: o.rank || 0,
        status: 'calculated',
        teamScore: o.teamScore || 0,
        teamRating: o.teamRating || '',
        teamRatingText: o.teamRatingText || '',
        songWeights: o.songWeights || { vocal: 0.34, dance: 0.33, charm: 0.33 },
        teamAttributes: o.teamAttributes || { vocal: 0, dance: 0, charm: 0 },
        playerPerformances: teamPlayerResults.map(p => ({
          roundId: o.roundId,
          playerId: p.playerId,
          playerName: p.playerName,
          teamId: o.teamId,
          teamName: o.teamName,
          performanceValue: p.performanceValue || 0,
          playerScore: p.playerScore || 0,
          stageRating: p.stageRating || '',
          stageRatingText: p.stageRatingText || '',
          contribution: p.playerScore ? Math.round((p.playerScore / totalTeamScore) * 100) : 0,
          rankInTeam: p.rankInTeam || 0
        }))
      }
    })

    res.json({
      success: true,
      message: '公演结算完成（新评级体系）',
      data: {
        roundId: round.id,
        roundIndex: round.index,
        teams: savedTeams.map(t => { const o = t.toObject(); delete o._id; return o }),
        players: savedPlayers.map(p => { const o = p.toObject(); delete o._id; return o }),
        teamResults: teamResultsData,
        teamCount: savedTeams.length,
        playerCount: savedPlayers.length,
        audienceVote: audienceVoteResult ? {
          totalAudience: audienceVoteResult.totalAudience,
          totalVotes: audienceVoteResult.totalVotes,
          rankings: audienceVoteResult.rankings
        } : null
      }
    })
  } catch (e) {
    console.error('Calculate performance error:', e)
    res.status(500).json({ success: false, error: '公演结算失败', code: 'SERVER_ERROR' })
  }
})

// ====================== GET /api/performance/result - 管理员端详细结果 ======================

router.get('/result', auth, requireAdmin, async (req, res) => {
  try {
    const round = await resolveRoundFromQuery(req)
    const filter = buildRoundFilter(round)
    const [teamPerf, playerPerf] = await Promise.all([
      TeamPerformance.find(filter),
      PlayerPerformance.find(filter)
    ])

    if (teamPerf.length === 0) {
      return res.json({ success: true, teamResults: [], playerResults: [] })
    }

    teamPerf.sort((a, b) => (a.rank || 999) - (b.rank || 999))
    playerPerf.sort((a, b) => (a.rank || 999) - (b.rank || 999))

    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    // 队伍详细数据
    const teamsData = teamPerf.map(tp => {
      const o = tp.toObject()
      delete o._id
      const teamPlayers = playerPerf.filter(p => p.teamId === tp.teamId).sort((a, b) => (a.rankInTeam || 999) - (b.rankInTeam || 999))
      return {
        ...o,
        players: teamPlayers.map(p => {
          const po = p.toObject()
          delete po._id
          po.avatar = userMap[p.playerId]?.avatar || null
          return po
        })
      }
    })

    // 安全/危险队伍（直接用 resolveRoundFromQuery 返回的 round，避免重新查询）
    const season = await getCurrentSeason()
    const dangerRatio = round?.dangerLineRatio ?? 0.2
    const dangerCount = Math.max(0, Math.ceil(teamsData.length * dangerRatio))
    const safeTeams = teamsData.slice(0, teamsData.length - dangerCount).map(t => ({ teamId: t.teamId, teamName: t.teamName, rank: t.rank }))
    const dangerTeams = teamsData.slice(teamsData.length - dangerCount).map(t => ({ teamId: t.teamId, teamName: t.teamName, rank: t.rank }))

    res.json({
      success: true,
      teamResults: teamsData,
      playerResults: playerPerf.map(p => {
        const po = p.toObject()
        delete po._id
        return po
      })
    })
  } catch (e) {
    console.error('Get result error:', e)
    res.status(500).json({ success: false, error: '获取结果失败', code: 'SERVER_ERROR' })
  }
})

// ====================== GET /api/performance/my-result - 选手端我的结果 ======================

router.get('/my-result', auth, async (req, res) => {
  try {
    const playerId = req.user.userId
    const round = await resolveRoundFromQuery(req)
    const filter = buildRoundFilter(round)
    const [teamPerf, playerPerf] = await Promise.all([
      TeamPerformance.find(filter),
      PlayerPerformance.find(filter)
    ])

    if (teamPerf.length === 0) {
      return res.json({ success: true, data: { settled: false } })
    }

    teamPerf.sort((a, b) => (a.rank || 999) - (b.rank || 999))
    playerPerf.sort((a, b) => (a.rank || 999) - (b.rank || 999))

    const myPerf = playerPerf.find(p => p.playerId === playerId)
    if (!myPerf) {
      return res.json({ success: true, data: { settled: true, participated: false, message: '您未参与本轮公演' } })
    }

    const myTeam = teamPerf.find(t => t.teamId === myPerf.teamId)
    const teamPlayers = playerPerf.filter(p => p.teamId === myPerf.teamId).sort((a, b) => (a.rankInTeam || 999) - (b.rankInTeam || 999))

    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    // 安全/危险（直接用 resolveRoundFromQuery 返回的 round）
    const season = await getCurrentSeason()
    const dangerRatio = round?.dangerLineRatio ?? 0.2
    const dangerCount = Math.max(0, Math.ceil(teamPerf.length * dangerRatio))
    const safeTeamIds = new Set(teamPerf.slice(0, teamPerf.length - dangerCount).map(t => t.teamId))
    const isSafe = safeTeamIds.has(myPerf.teamId)

    // 舞台评价文案
    const perfValue = myPerf.performanceValue || 0
    let perfLabel = '稳定发挥'
    if (perfValue >= 15) perfLabel = '超常发挥'
    else if (perfValue >= 8) perfLabel = '优秀发挥'
    else if (perfValue < -5) perfLabel = '发挥失常'
    else if (perfValue < 0) perfLabel = '略有失误'

    res.json({
      success: true,
      data: {
        settled: true,
        participated: true,
        myTeam: myTeam ? {
          teamId: myTeam.teamId, teamName: myTeam.teamName,
          songName: myTeam.songName, finalVotes: myTeam.finalVotes,
          rank: myTeam.rank,
          songVocalWeight: myTeam.songVocalWeight, songDanceWeight: myTeam.songDanceWeight, songCharmWeight: myTeam.songCharmWeight,
          baseVotes: myTeam.baseVotes, attributeVotes: myTeam.attributeVotes,
          performanceVotes: myTeam.performanceVotes, compatibilityVotes: myTeam.compatibilityVotes,
          eventVotes: myTeam.eventVotes,
          eventName: myTeam.eventName, eventDescription: myTeam.eventDescription
        } : null,
        myPerformance: {
          performanceValue: perfValue,
          performanceLabel: perfLabel,
          contribution: myPerf.contribution,
          rankInTeam: myPerf.rankInTeam,
          rank: myPerf.rank
        },
        teamContributions: teamPlayers.map(p => ({
          playerId: p.playerId, playerName: p.playerName,
          avatar: userMap[p.playerId]?.avatar || null,
          performanceValue: p.performanceValue,
          contribution: p.contribution,
          rankInTeam: p.rankInTeam,
          isMe: p.playerId === playerId
        })),
        fullRanking: teamPerf.map(t => ({
          teamId: t.teamId, teamName: t.teamName,
          finalVotes: t.finalVotes, rank: t.rank
        })),
        safetyStatus: isSafe ? 'safe' : 'danger',
        safetyMessage: isSafe ? '安全' : '危险'
      }
    })
  } catch (e) {
    console.error('Get my-result error:', e)
    res.status(500).json({ success: false, error: '获取我的结果失败', code: 'SERVER_ERROR' })
  }
})

// ====================== GET /api/performance/teams ======================

router.get('/teams', auth, async (req, res) => {
  try {
    const round = await resolveRoundFromQuery(req)
    const filter = buildRoundFilter(round)
    const results = await TeamPerformance.find(filter)
    results.sort((a, b) => (a.rank || 999) - (b.rank || 999))
    res.json({ success: true, data: results.map(r => { const o = r.toObject(); delete o._id; return o }) })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取团队公演结果失败', code: 'SERVER_ERROR' })
  }
})

// ====================== GET /api/performance/players ======================

router.get('/players', auth, async (req, res) => {
  try {
    const round = await resolveRoundFromQuery(req)
    const filter = buildRoundFilter(round)
    const results = await PlayerPerformance.find(filter)
    results.sort((a, b) => (a.rank || 999) - (b.rank || 999))
    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u
    const data = results.map(r => { const o = r.toObject(); delete o._id; o.playerName = o.playerName || userMap[r.playerId]?.name || null; return o })
    res.json({ success: true, data })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取选手公演结果失败', code: 'SERVER_ERROR' })
  }
})

// ====================== DELETE /api/performance ======================

router.delete('/', auth, requireAdmin, async (req, res) => {
  try {
    const round = await resolveRound(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次', code: 'NO_ROUND' })
    const filter = buildRoundFilter(round)
    await TeamPerformance.deleteMany(filter)
    await PlayerPerformance.deleteMany(filter)
    res.json({ success: true, message: `已清空第 ${round.index} 轮公演结果` })
  } catch (e) {
    res.status(500).json({ success: false, error: '清空失败', code: 'SERVER_ERROR' })
  }
})

// ====================== 大众评审喜爱度投票接口 ======================

const AudienceVoteSession = require('../models/AudienceVoteSession')
const AudienceMember = require('../models/AudienceMember')
const AudienceVote = require('../models/AudienceVote')

// POST /api/performance/generate-audience-vote
router.post('/generate-audience-vote', auth, requireAdmin, async (req, res) => {
  try {
    const round = await resolveRound(req)
    if (!round) return res.status(400).json({ success: false, message: '未找到轮次（请传 roundId）' })

    const result = await generateAudienceVoteForRound(round)
    res.json({ success: true, data: result })
  } catch (e) {
    console.error('Generate audience vote error:', e)
    res.status(500).json({ success: false, message: e.message || '生成大众评审投票失败' })
  }
})

// GET /api/performance/audience-ranking
router.get('/audience-ranking', auth, async (req, res) => {
  try {
    const round = await resolveRoundFromQuery(req)
    if (!round) return res.status(400).json({ success: false, message: '请传 roundId 参数' })

    const [votes, playerPerfs, users] = await Promise.all([
      AudienceVote.find({ roundId: round.id }),
      PlayerPerformance.find({ roundId: round.id }),
      User.find({})
    ])
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    const voteCounts = {}
    for (const v of votes) {
      voteCounts[v.playerId] = (voteCounts[v.playerId] || 0) + 1
    }

    const rankings = playerPerfs
      .map(p => ({
        playerId: p.playerId,
        playerName: p.playerName || (userMap[p.playerId]?.name) || p.playerId,
        votes: voteCounts[p.playerId] || 0,
        popularityWeight: p.popularityWeight || 0,
        audienceAffinity: p.audienceAffinity || 0
      }))
      .sort((a, b) => b.votes - a.votes)
    rankings.forEach((r, i) => { r.rank = i + 1 })

    // 权重排名
    const weightRanking = [...rankings].sort((a, b) => b.popularityWeight - a.popularityWeight)

    res.json({
      success: true,
      data: { rankings, weightRanking }
    })
  } catch (e) {
    console.error('Get audience ranking error:', e)
    res.status(500).json({ success: false, message: '获取喜爱度排名失败' })
  }
})

// GET /api/performance/audience-seats
router.get('/audience-seats', auth, async (req, res) => {
  try {
    const round = await resolveRoundFromQuery(req)
    if (!round) return res.status(400).json({ success: false, message: '请传 roundId 参数' })

    const members = await AudienceMember.find({ roundId: round.id })
    members.sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0))
    res.json({ success: true, data: members })
  } catch (e) {
    console.error('Get audience seats error:', e)
    res.status(500).json({ success: false, message: '获取评审席位失败' })
  }
})

// GET /api/performance/audience-vote-detail
router.get('/audience-vote-detail', auth, async (req, res) => {
  try {
    const round = await resolveRoundFromQuery(req)
    if (!round) return res.status(400).json({ success: false, message: '请传 roundId 参数' })

    const { seatNumber } = req.query
    const filter = { roundId: round.id }
    if (seatNumber) filter.seatNumber = parseInt(seatNumber)

    const votes = await AudienceVote.find(filter)
    votes.sort((a, b) => (a.voteOrder || 0) - (b.voteOrder || 0))

    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    const detail = votes.map(v => ({
      voteOrder: v.voteOrder,
      playerId: v.playerId,
      playerName: userMap[v.playerId]?.name || v.playerId,
      seatNumber: v.seatNumber
    }))

    res.json({ success: true, data: detail })
  } catch (e) {
    console.error('Get audience vote detail error:', e)
    res.status(500).json({ success: false, message: '获取投票详情失败' })
  }
})

// ====================== 接口 8: POST /api/performance/safe-teams - 标记安全团 ======================

const eliminationService = require('../services/eliminationService')

router.post('/safe-teams', auth, requireAdmin, async (req, res) => {
  try {
    const { round, teamIds } = req.body
    if (!Array.isArray(teamIds) || teamIds.length === 0) {
      return res.status(400).json({ success: false, error: '请选择要标记的队伍', code: 'MISSING_PARAM' })
    }
    if (typeof round !== 'number' || round < 1) {
      return res.status(400).json({ success: false, error: '无效的轮次参数', code: 'INVALID_PARAM' })
    }

    const result = await eliminationService.markSafeTeams(round, teamIds)

    try {
      await logAction(req.user.userId, req.user.name, req.user.role,
        ACTION_TYPES.ELIMINATION || 'ELIMINATION',
        'safeTeam', `round-${round}`,
        `第 ${round} 轮标记 ${teamIds.length} 个安全团`)
    } catch (logErr) { console.warn(logErr) }

    res.json({ success: true, data: result })
  } catch (e) {
    console.error('Mark safe teams error:', e)
    res.status(500).json({ success: false, error: e.message || '标记安全团失败', code: 'SERVER_ERROR' })
  }
})

// ====================== 接口 9: GET /api/performance/safe-teams - 获取安全团列表 ======================

router.get('/safe-teams', auth, async (req, res) => {
  try {
    const roundIndex = req.query.round !== undefined ? parseInt(req.query.round) : undefined
    const result = await eliminationService.getSafeTeams(roundIndex)
    res.json({ success: true, data: result })
  } catch (e) {
    console.error('Get safe teams error:', e)
    res.status(500).json({ success: false, error: '获取安全团列表失败', code: 'SERVER_ERROR' })
  }
})

// ====================== 公演结算流程接口 ======================

// ===== POST /api/performance/start - 管理员开启本轮公演（放权给选手端）=====
router.post('/start', auth, requireAdmin, async (req, res) => {
  try {
    const round = await resolveRound(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次（请传 roundId 或 roundIndex）', code: 'NO_ROUND' })

    const { roundId } = req.body
    const frontRoundId = roundId || `round-${round.index}`

    const season = await getCurrentSeason()
    if (season) {
      season.currentStage = 'performance'
      season.updatedAt = new Date().toISOString()
      await season.save()
    }

    // 持久化公演开启状态
    await PerformanceRoundState.deleteMany({ roundId: round.id })
    const state = new PerformanceRoundState({
      id: generateId(),
      roundId: round.id,
      roundIndex: round.index,
      started: true,
      revealedTeamIds: [],
      updatedAt: new Date().toISOString()
    })
    await state.save()

    await logAction(req.user.userId, req.user.name || 'admin', 'admin', 'PERFORMANCE_START', 'round', round.id, `开启第 ${round.index} 轮公演`)

    // 清除该轮旧发挥值（如有）
    await PerformanceValue.deleteMany({ roundId: round.id })

    res.json({ success: true, message: '公演已开启，选手端可开始生成发挥值', roundId: round.id, roundIndex: round.index })
  } catch (e) {
    console.error('Start performance error:', e)
    res.status(500).json({ success: false, error: '开启公演失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/performance/player-generate - 选手端生成随机发挥值 =====
router.post('/player-generate', auth, async (req, res) => {
  try {
    const { roundId } = req.body
    const playerId = req.user.userId
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })

    const round = await Round.findOne({ id: roundId })
    let rId = round ? round.id : null
    if (!rId) {
      const match = roundId.match(/^round[_-](\d+)$/)
      if (match) {
        const idx = parseInt(match[1])
        const season = await getCurrentSeason()
        if (season) {
          const r = await Round.findOne({ seasonId: season.id, index: idx })
          if (r) rId = r.id
        }
      }
    }
    if (!rId) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })

    const resolvedRound = round || { id: rId, index: parseInt((roundId.match(/^round[_-](\d+)$/) || [])[1]) || 0 }

    // 检查是否已生成（选手不可重复生成）
    const existing = await PerformanceValue.findOne({ roundId: rId, playerId })
    if (existing) {
      return res.status(409).json({
        success: false, error: '您已生成过发挥值，不可重复', code: 'ALREADY_GENERATED',
        data: { performanceValue: existing.performanceValue }
      })
    }

    // 兼容 roundId 格式：DB UUID 和前端 round-1 两种格式
    const frontRoundId = roundId
    const roundIdFilter = rId !== frontRoundId
      ? { $or: [{ roundId: rId }, { roundId: frontRoundId }] }
      : { roundId: rId }

    // 获取选手所在队伍
    const member = await RoundTeamMember.findOne({ ...roundIdFilter, playerId })
    if (!member) return res.status(400).json({ success: false, error: '您未参加本轮组队', code: 'NOT_IN_TEAM' })

    const value = randomInt(-10, 40)
    await createPerformanceValue({ roundId: rId, roundIndex: resolvedRound.index, playerId, teamId: member.teamId, value })

    res.json({
      success: true,
      data: { playerId, teamId: member.teamId, performanceValue: value, performanceText: getPerformanceText(value) }
    })
  } catch (e) {
    console.error('Player generate error:', e)
    res.status(500).json({ success: false, error: '生成发挥值失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/performance/admin-generate - 管理员代选手生成发挥值 =====
router.post('/admin-generate', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, playerId, performanceValue: manualValue } = req.body
    if (!roundId || !playerId) return res.status(400).json({ success: false, error: 'roundId 和 playerId 必填', code: 'INVALID_PARAMS' })

    const round = await resolveRound(req)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id

    // 删除旧值（管理员可覆盖）
    await PerformanceValue.deleteMany({ roundId: rId, playerId })

    // 生成发挥值：支持手动指定或随机（逻辑同选手端）
    const value = typeof manualValue === 'number'
      ? Math.max(-10, Math.min(40, manualValue))
      : randomInt(-10, 40)

    // 查找选手所在队伍（兼容两种 roundId 格式）
    const frontRoundId = roundId
    const roundIdFilter = rId !== frontRoundId
      ? { $or: [{ roundId: rId }, { roundId: frontRoundId }] }
      : { roundId: rId }
    const member = await RoundTeamMember.findOne({ ...roundIdFilter, playerId })
    await createPerformanceValue({ roundId: rId, roundIndex: round.index, playerId, teamId: member ? member.teamId : null, value })

    const user = await User.findOne({ id: playerId })
    res.json({
      success: true,
      data: {
        playerId,
        playerName: user ? user.name : null,
        performanceValue: value,
        performanceText: getPerformanceText(value)
      }
    })
  } catch (e) {
    console.error('Admin generate error:', e)
    res.status(500).json({ success: false, error: '生成发挥值失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/performance/admin-generate-all - 管理员一键为所有选手生成 =====
router.post('/admin-generate-all', auth, requireAdmin, async (req, res) => {
  try {
    const round = await resolveRound(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次', code: 'NO_ROUND' })

    // 获取该轮所有选手
    const members = await RoundTeamMember.find({ roundId: round.id })
    if (members.length === 0) return res.status(400).json({ success: false, error: '该轮没有选手', code: 'NO_PLAYERS' })

    // 获取已有发挥值（不覆盖已生成的）
    const existingValues = await PerformanceValue.find({ roundId: round.id })
    const existingPlayerIds = new Set(existingValues.map(v => v.playerId))

    const created = []
    const skipped = []
    for (const m of members) {
      if (existingPlayerIds.has(m.playerId)) {
        skipped.push({ playerId: m.playerId, performanceValue: existingValues.find(v => v.playerId === m.playerId)?.performanceValue })
        continue
      }
      const value = randomInt(-10, 40)
      await createPerformanceValue({ roundId: round.id, roundIndex: round.index, playerId: m.playerId, teamId: m.teamId, value })
      created.push({ playerId: m.playerId, performanceValue: value, performanceText: getPerformanceText(value) })
    }

    res.json({ success: true, data: { generatedCount: created.length, skippedCount: skipped.length, players: [...created, ...skipped] } })
  } catch (e) {
    console.error('Admin generate all error:', e)
    res.status(500).json({ success: false, error: '批量生成失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/performance/player-status - 获取各选手是否已生成 =====
router.get('/player-status', auth, async (req, res) => {
  try {
    const { roundId: queryRoundId } = req.query
    const round = await resolveRoundFromQuery(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次（请传 roundId 或 round）', code: 'NO_ROUND' })

    // 检查公演是否已开启
    const state = await PerformanceRoundState.findOne({ roundId: round.id })
    const started = state ? state.started : false

    // 兼容 roundId 查询：使用 DB UUID 和前端 roundId 两种格式
    const frontRoundId = queryRoundId || `round-${round.index}`
    const roundIdFilter = round.id !== frontRoundId
      ? { $or: [{ roundId: round.id }, { roundId: frontRoundId }] }
      : { roundId: round.id }

    // 所有选手
    const members = await RoundTeamMember.find(roundIdFilter)
    const userIds = [...new Set(members.map(m => m.playerId))]
    const users = await User.find({ id: { $in: userIds } })
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    // 队伍信息
    const teams = await RoundTeam.find(roundIdFilter)
    const teamMap = {}
    for (const t of teams) teamMap[t.id] = t

    // 已生成发挥值
    const values = await PerformanceValue.find({ roundId: round.id })
    const generatedSet = new Set(values.map(v => v.playerId))
    const valueMap = {}
    for (const v of values) valueMap[v.playerId] = v.performanceValue

    const players = members.map(m => ({
      playerId: m.playerId,
      playerName: userMap[m.playerId] ? userMap[m.playerId].name : null,
      teamId: m.teamId,
      teamName: teamMap[m.teamId] ? teamMap[m.teamId].name : null,
      generated: generatedSet.has(m.playerId),
      performanceValue: valueMap[m.playerId] != null ? valueMap[m.playerId] : null
    }))

    res.json({
      success: true,
      started,
      players
    })
  } catch (e) {
    console.error('Get player status error:', e)
    res.status(500).json({ success: false, error: '获取选手状态失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/performance/player-status/save - 批量保存/覆盖选手发挥值 =====
router.post('/player-status/save', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, players } = req.body
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    if (!Array.isArray(players)) return res.status(400).json({ success: false, error: 'players 必须是数组', code: 'INVALID_PARAMS' })

    const round = await resolveRound(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次（请传 roundId 或 roundIndex）', code: 'NO_ROUND' })

    for (const p of players) {
      // performanceValue 为 null 表示未生成，跳过
      if (p.performanceValue === null || p.performanceValue === undefined) continue

      let perfVal = parseInt(p.performanceValue)
      if (isNaN(perfVal)) continue
      if (perfVal < -5) perfVal = -5
      if (perfVal > 15) perfVal = 15

      // 覆盖式保存：先删旧值，再写入新值
      await PerformanceValue.deleteMany({ roundId: round.id, playerId: p.playerId })

      const pv = new PerformanceValue({
        id: generateId(),
        roundId: round.id,
        roundIndex: round.index,
        playerId: p.playerId,
        teamId: p.teamId || null,
        performanceValue: perfVal,
        generatedAt: new Date().toISOString()
      })
      await pv.save()
    }

    res.json({ success: true })
  } catch (e) {
    console.error('Save player status error:', e)
    res.status(500).json({ success: false, error: '保存选手发挥值失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/performance/round-status - 获取轮次公演状态（选手端用）=====
router.get('/round-status', auth, async (req, res) => {
  try {
    const round = await resolveRoundFromQuery(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次', code: 'NO_ROUND' })

    // 检查 season 当前阶段
    const season = await getCurrentSeason()
    const seasonStage = season ? season.currentStage : null

    // 检查 PerformanceRoundState
    const state = await PerformanceRoundState.findOne({ roundId: round.id })
    const started = state ? state.started : false

    // 检查是否已结算（TeamPerformance 有记录）
    const teamPerfs = await TeamPerformance.find({ roundId: round.id })
    const settled = teamPerfs.length > 0

    // 检查是否已释放（AudienceVoteFinalRanking 有记录）
    const finalRanking = await AudienceVoteFinalRanking.findOne({ roundId: round.id })
    const released = !!finalRanking

    res.json({
      success: true,
      data: {
        started,
        settled,
        released,
        seasonStage,
        // 判断这个轮次是否已进入公演阶段（PerformanceRoundState 存在）
        opened: !!state
      }
    })
  } catch (e) {
    console.error('Get round status error:', e)
    res.status(500).json({ success: false, error: '获取轮次状态失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/performance/open - 管理员进入公演管理页面时调用 =====
router.post('/open', auth, requireAdmin, async (req, res) => {
  try {
    const round = await resolveRound(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次', code: 'NO_ROUND' })

    // 更新赛季阶段为 performance（使其可访问）
    const season = await getCurrentSeason()
    if (season && season.currentStage !== 'performance') {
      season.currentStage = 'performance'
      season.updatedAt = new Date().toISOString()
      await season.save()
    }

    // 创建 PerformanceRoundState（如果不存在）
    let state = await PerformanceRoundState.findOne({ roundId: round.id })
    if (!state) {
      state = new PerformanceRoundState({
        id: generateId(),
        roundId: round.id,
        roundIndex: round.index,
        started: false,
        revealedTeamIds: [],
        updatedAt: new Date().toISOString()
      })
      await state.save()

      await logAction(
        req.user.userId, req.user.name || 'admin', 'admin',
        'PERFORMANCE_OPEN', 'round', round.id,
        `打开第 ${round.index} 轮公演管理`
      )
    }

    res.json({ success: true, data: { opened: true, started: state.started } })
  } catch (e) {
    console.error('Open performance error:', e)
    res.status(500).json({ success: false, error: '开启公演管理失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/performance/revealed-teams/save - 保存已揭晓队伍 =====
router.post('/revealed-teams/save', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, revealedTeamIds } = req.body
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    if (!Array.isArray(revealedTeamIds)) return res.status(400).json({ success: false, error: 'revealedTeamIds 必须是数组', code: 'INVALID_PARAMS' })

    const round = await resolveRound(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次（请传 roundId 或 roundIndex）', code: 'NO_ROUND' })

    // 覆盖式保存
    let state = await PerformanceRoundState.findOne({ roundId: round.id })
    if (!state) {
      state = new PerformanceRoundState({
        id: generateId(),
        roundId: round.id,
        roundIndex: round.index,
        started: false,
        revealedTeamIds: [],
        updatedAt: new Date().toISOString()
      })
    }
    state.revealedTeamIds = revealedTeamIds
    state.updatedAt = new Date().toISOString()
    await state.save()

    res.json({ success: true, message: `已保存 ${revealedTeamIds.length} 个已揭晓队伍` })
  } catch (e) {
    console.error('Save revealed teams error:', e)
    res.status(500).json({ success: false, error: '保存已揭晓队伍失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/performance/reveal-team - 揭晓某个队伍的结果（新评级体系）=====
router.post('/reveal-team', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, teamId } = req.body
    if (!roundId || !teamId) return res.status(400).json({ success: false, error: 'roundId 和 teamId 必填', code: 'INVALID_PARAMS' })

    const round = await Round.findOne({ id: roundId })
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })

    // 获取队伍信息
    const team = await RoundTeam.findOne({ id: teamId })
    if (!team) return res.status(404).json({ success: false, error: '队伍不存在', code: 'TEAM_NOT_FOUND' })

    // 获取歌曲
    const teamSong = await TeamSong.findOne({ roundId: round.id, teamId })
    const song = teamSong ? await Song.findOne({ id: teamSong.songId }) : null
    if (!song) return res.status(400).json({ success: false, error: '该队伍未分配歌曲', code: 'NO_SONG' })

    // 获取成员发挥值
    const members = await RoundTeamMember.find({ roundId: round.id, teamId })
    const values = await PerformanceValue.find({ roundId: round.id, teamId })
    const valueMap = {}
    for (const v of values) valueMap[v.playerId] = v.performanceValue

    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    // 使用新公式计算每位成员的个人分和评级
    const membersWithPerf = members.map(m => {
      const u = userMap[m.playerId]
      if (!u) return null
      const perfValue = valueMap[m.playerId] ?? randomInt(-10, 40) // 未生成则随机补一个
      const { playerScore, stageRating, stageRatingText } = calcPlayerScore(u, song, perfValue)
      return {
        playerId: m.playerId,
        playerName: u.name,
        performanceValue: perfValue,
        playerScore,
        stageRating,
        stageRatingText
      }
    }).filter(Boolean)

    // 计算团队分和团队评级
    const memberScores = membersWithPerf.map(m => m.playerScore)
    const { teamScore, teamRating, teamRatingText } = calcTeamScore(memberScores, team.name)

    res.json({
      success: true,
      data: {
        teamId: team.id,
        teamName: team.name,
        songName: song.name,
        members: membersWithPerf,
        teamScore,
        teamRating,
        teamRatingText
      }
    })
  } catch (e) {
    console.error('Reveal team error:', e)
    res.status(500).json({ success: false, error: '揭晓队伍失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/performance/revealed-teams - 获取已揭晓的队伍列表 =====
router.get('/revealed-teams', auth, async (req, res) => {
  try {
    const round = await resolveRoundFromQuery(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次（请传 roundId 或 round）', code: 'NO_ROUND' })

    // 已结算的队伍（TeamPerformance 有记录 = 已揭晓）
    const teamPerfs = await TeamPerformance.find({ roundId: round.id })
    const calcRevealedIds = teamPerfs.map(tp => tp.teamId)

    // 从持久化状态获取已揭晓队伍
    const state = await PerformanceRoundState.findOne({ roundId: round.id })
    const savedRevealedIds = state && Array.isArray(state.revealedTeamIds) ? state.revealedTeamIds : []

    // 合并两种来源
    const revealedTeamIds = [...new Set([...calcRevealedIds, ...savedRevealedIds])]
    const teams = await RoundTeam.find({ roundId: round.id })

    res.json({
      success: true,
      data: {
        roundId: round.id,
        revealedTeamIds,
        allRevealed: revealedTeamIds.length >= teams.length && teams.length > 0,
        revealedCount: revealedTeamIds.length,
        totalTeams: teams.length
      }
    })
  } catch (e) {
    console.error('Get revealed teams error:', e)
    res.status(500).json({ success: false, error: '获取揭晓状态失败', code: 'SERVER_ERROR' })
  }
})

// ====================== DELETE /api/performance - 清除公演结果 ======================

router.delete('/', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId } = req.body
    if (!roundId) {
      return res.status(400).json({
        success: false,
        error: 'roundId 参数必填',
        code: 'MISSING_ROUND_ID'
      })
    }

    // 解析 roundId（兼容 round-1 / round_1 / 数字格式）
    // 构造一个包含 roundId 的 req 对象传给 resolveRound
    const fakeReq = { body: { roundId }, query: {} }
    const round = await resolveRound(fakeReq)
    if (!round) {
      return res.status(400).json({
        success: false,
        error: '轮次不存在',
        code: 'ROUND_NOT_FOUND'
      })
    }

    const dbRoundId = round.id
    const frontRoundId = `round-${round.index}`

    // 清除该轮次的公演结果
    const [delTeamPerf, delPlayerPerf, delPerfValue] = await Promise.all([
      TeamPerformance.deleteMany({ roundId: { $in: [dbRoundId, frontRoundId] } }),
      PlayerPerformance.deleteMany({ roundId: { $in: [dbRoundId, frontRoundId] } }),
      PerformanceValue.deleteMany({ roundId: { $in: [dbRoundId, frontRoundId] } })
    ])

    // 清除公演轮次状态（已揭晓队伍列表等）
    await PerformanceRoundState.deleteMany({ roundId: dbRoundId })

    await logAction(
      req.user.userId,
      req.user.name || 'admin',
      'admin',
      'PERFORMANCE_CLEAR',
      'round',
      dbRoundId,
      `清除第 ${round.index} 轮公演结果`
    )

    res.json({
      success: true,
      message: `已清除第 ${round.index} 轮的公演结果`,
      data: {
        roundId: dbRoundId,
        roundIndex: round.index,
        deletedTeamResults: delTeamPerf || 0,
        deletedPlayerResults: delPlayerPerf || 0,
        deletedPerformanceValues: delPerfValue || 0
      }
    })
  } catch (error) {
    console.error('Clear performance error:', error)
    res.status(500).json({
      success: false,
      error: '清除失败: ' + error.message,
      code: 'SERVER_ERROR'
    })
  }
})

module.exports = router