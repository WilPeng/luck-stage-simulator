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
const StageEvent = require('../models/StageEvent')
const { generateAudienceVoteForRound, clearAudienceVote, randomChineseName, randomGender, randomAge, randomOccupation } = require('../services/audienceVoteService')
const PerformanceValue = require('../models/PerformanceValue')
const TrainingStatus = require('../models/TrainingStatus')
const PerformanceRoundState = require('../models/PerformanceRoundState')
const AudienceVoteFinalRanking = require('../models/AudienceVoteFinalRanking')
const AudienceMember = require('../models/AudienceMember')
const AudienceTeamVote = require('../models/AudienceTeamVote')

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

// ===== 共用工具：发挥成绩文案（各玩法成绩口径不同，统一记为成绩值）=====
function getPerformanceText(value) {
  if (value === null || value === undefined) return ''
  return `成绩 ${value}`
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
  if (score >= 85) return { stageRating: 'S', stageRatingText: '超级完美' }
  if (score >= 65) return { stageRating: 'A', stageRatingText: '完美' }
  if (score >= 45) return { stageRating: 'B', stageRatingText: '正常' }
  if (score >= 25) return { stageRating: 'C', stageRatingText: '翻车' }
  return { stageRating: 'D', stageRatingText: '超级翻车' }
}

const RATING_TEXTS = { S: '超级完美', A: '完美', B: '正常', C: '翻车', D: '超级翻车' }

/**
 * 3.3 个人评级骰面
 * - 骰子面数 = 歌曲难度；点数越大评级越低（1..difficulty 对应 A/B/C/D）
 * - 未达标差值：deficit = max(0,基准vocal-实际vocal) + max(0,基准dance-实际dance)（超额不算）
 *   steps = ceil(deficit / 风险值)，x = steps / 难度
 *   x<=1: C 概率 = x；x>1: C 概率 = max(1/难度, 2-x)，D 概率 = min(1-1/难度, x-1)
 */
function computeRatingFaces(player, song) {
  const attrs = player.attributes || { vocal: 30, dance: 30, charm: 30 }
  const mainAttr = (song.mainAttribute === 'dance' || song.mainAttribute === 'charm') ? song.mainAttribute : 'vocal'
  const d = Math.max(2, Math.round(song.difficulty || 3))
  const risk = Math.max(1, Number(song.risk) || 10)
  const baseVocal = typeof song.baseVocal === 'number' ? song.baseVocal : 30
  const baseDance = typeof song.baseDance === 'number' ? song.baseDance : 30
  const baseMet = (attrs.vocal ?? 0) >= baseVocal && (attrs.dance ?? 0) >= baseDance
  const mainBase = mainAttr === 'dance' ? baseDance : (mainAttr === 'charm' ? Math.round((baseVocal + baseDance) / 2) : baseVocal)
  const excess = (attrs[mainAttr] ?? 0) - mainBase
  const steps = Math.max(0, Math.floor(excess / risk))

  // 未达标差值（只算缺少的部分，超额不计）
  const deficit = Math.max(0, baseVocal - (attrs.vocal ?? 0)) + Math.max(0, baseDance - (attrs.dance ?? 0))
  const deficitSteps = deficit > 0 ? Math.ceil(deficit / risk) : 0
  let cPenalty = 0
  let dPenalty = 0
  if (deficitSteps > 0) {
    const x = deficitSteps / d
    const pC = x <= 1 ? x : Math.max(1 / d, 2 - x)
    const pD = x <= 1 ? 0 : Math.min(1 - 1 / d, x - 1)
    cPenalty = Math.round(pC * d)
    dPenalty = Math.round(pD * d)
    // 惩罚面数不超过骰面，且至少保留 1 面 C
    if (cPenalty + dPenalty > d) {
      dPenalty = Math.max(0, Math.min(dPenalty, d - 1))
      cPenalty = d - dPenalty
    }
    if (dPenalty > 0 && cPenalty < 1) cPenalty = 1
  }

  // 常规（按主属性超出基准的倍数）
  const normalA = Math.min(Math.max(steps - (d - 1), 0), Math.max(0, d - 2))
  const normalAPlusB = Math.min(steps, d - 1)
  const normalB = Math.max(0, normalAPlusB - normalA)
  const normalC = d - normalAPlusB

  // 惩罚面从最优面（A→B→C）扣除，保证总面数 = d
  let a = normalA
  let b = normalB
  let c = normalC + cPenalty
  let penalty = cPenalty + dPenalty
  const takeA = Math.min(a, penalty); a -= takeA; penalty -= takeA
  const takeB = Math.min(b, penalty); b -= takeB; penalty -= takeB
  if (penalty > 0) { const t = Math.min(c, penalty); c -= t; penalty -= t }

  return {
    mainAttr, difficulty: d, risk, baseVocal, baseDance, mainBase, baseMet,
    excess, steps, deficit, deficitSteps,
    faces: { a, b, c, d: dPenalty, total: d },
    attrs
  }
}

/** 3.3 掷骰：点数越大评级越低 */
function rollPlayerRating(player, song) {
  const f = computeRatingFaces(player, song)
  const face = Math.floor(Math.random() * f.difficulty) + 1
  const { a, b, c } = f.faces
  let rating = 'D'
  if (face <= a) rating = 'A'
  else if (face <= a + b) rating = 'B'
  else if (face <= a + b + c) rating = 'C'
  else rating = 'D'
  if (rating === 'A' && face === 1 && f.deficitSteps === 0 && f.steps >= (2 * f.difficulty - 3)) rating = 'S'
  return { rating, ratingText: RATING_TEXTS[rating], roll: face, ...f }
}

/** 计算机个人分和评级 (带控制台日志) */
function calcPlayerScore(player, song, performanceValue, presetRating) {
  // ★ BUG 修复: 属性从 player.attributes 中读取，不是 player 顶层 ★
  const rawVocal = player.attributes?.vocal ?? 0
  const rawDance = player.attributes?.dance ?? 0
  const rawCharm = player.attributes?.charm ?? 0

  // 属性分（三项平均）
  const attributeScore = Math.round((rawVocal + rawDance + rawCharm) / 3)

  // 难度系数 difficulty=1→1.0, difficulty=5→0.6
  const difficultyFactor = +(1 - (song.difficulty - 1) * 0.1).toFixed(2)

  // 发挥加成 = 成绩（各玩法口径不同，仅作展示，不计入最终票数）
  const performanceBonus = performanceValue

  // 最终分数 0~120
  const rawScore = attributeScore * difficultyFactor + performanceBonus
  let playerFinalScore = Math.round(rawScore)
  if (playerFinalScore < 0) playerFinalScore = 0
  if (playerFinalScore > 120) playerFinalScore = 120

  let rating
  if (presetRating && presetRating.rating) {
    const f = computeRatingFaces(player, song)
    rating = { rating: presetRating.rating, ratingText: RATING_TEXTS[presetRating.rating] || presetRating.rating, roll: presetRating.roll ?? null, ...f }
  } else {
    rating = rollPlayerRating(player, song)
  }
  const stageRating = rating.rating
  const stageRatingText = rating.ratingText

  // ===== 控制台详细日志（评级制） =====
  console.log('')
  console.log('╔══════════════════════════════════════════════╗')
  console.log(`║  个人评级 · ${player.name || player.playerId || '未知选手'}`)
  console.log(`║  歌曲: ${song.name} | 难度: ${song.difficulty} 面骰 | 风险值: ${rating.risk}`)
  console.log(`║  选手属性: 声乐=${rawVocal} 舞蹈=${rawDance} 魅力=${rawCharm}`)
  console.log(`║  主属性: ${rating.mainAttr} | 基准: ${rating.mainBase} | 超出: ${rating.excess}（${rating.steps}×风险值）`)
  console.log(`║  未达标差值: ${rating.deficit}（${rating.deficitSteps}×风险值）`)
  console.log(`║  骰面: A=${rating.faces.a} B=${rating.faces.b} C=${rating.faces.c} D=${rating.faces.d}`)
  console.log(`║  掷出 ${rating.roll} 点 → 评级: ${stageRating}(${stageRatingText})`)
  console.log('╚══════════════════════════════════════════════╝')

  return {
    playerScore: playerFinalScore, stageRating, stageRatingText, attributeScore, difficultyFactor, performanceBonus,
    ratingFaces: rating.faces, ratingRoll: rating.roll, ratingMainAttr: rating.mainAttr,
    ratingBaseMet: rating.baseMet, ratingSteps: rating.steps, ratingExcess: rating.excess,
    ratingDeficit: rating.deficit, ratingDeficitSteps: rating.deficitSteps,
    ratingMainBase: rating.mainBase, ratingDifficulty: rating.difficulty, ratingRisk: rating.risk
  }
}

// ===== 3.4 团队评级（按成员个人评级 + 可配置规则，顺序判定）=====
const TEAM_RATING_TEXTS = { S: '超级完美', A: '完美', B: '正常', C: '翻车', D: '惨不忍睹' }

// 默认规则：2人翻车→惨不忍睹 / 1人翻车→翻车 / 2人超级完美→超级完美 / 2人完美及以上→完美 / 其他→正常
const DEFAULT_TEAM_RATING_RULES = [
  { count: 2, ratings: ['C'], teamRating: 'D' },
  { count: 1, ratings: ['C'], teamRating: 'C' },
  { count: 2, ratings: ['S'], teamRating: 'S' },
  { count: 2, ratings: ['S', 'A'], teamRating: 'A' },
  { count: 0, ratings: [], teamRating: 'B' }
]

function getTeamRatingRules(config, teamSize) {
  if (!config) return DEFAULT_TEAM_RATING_RULES
  if (Array.isArray(config)) return config.length ? config : DEFAULT_TEAM_RATING_RULES
  const bySize = config[String(teamSize)]
  if (Array.isArray(bySize) && bySize.length) return bySize
  if (Array.isArray(config.default) && config.default.length) return config.default
  return DEFAULT_TEAM_RATING_RULES
}

// 新规则结构：{ combine: 'all'|'any', teamRating, conditions: [{ metric, ratings?, op, value }] }
// 兼容旧结构：{ count, ratings, teamRating }
function normalizeRule(rule) {
  if (rule && Array.isArray(rule.conditions)) return rule
  const cnt = Number(rule && rule.count) || 0
  if (cnt <= 0) return { combine: 'all', teamRating: (rule && rule.teamRating) || 'B', conditions: [] }
  return {
    combine: 'all',
    teamRating: (rule && rule.teamRating) || 'B',
    conditions: [{ metric: 'countRating', ratings: (rule && rule.ratings) || [], op: '>=', value: cnt }]
  }
}

function evalCondition(cond, ctx) {
  const op = cond.op || '>='
  const value = Number(cond.value) || 0
  let actual = 0
  switch (cond.metric) {
    case 'countRating': actual = (ctx.memberRatings || []).filter(r => (cond.ratings || []).includes(r)).length; break
    case 'teamScore': actual = ctx.teamScore ?? 0; break
    case 'avgCharm': actual = ctx.avgCharm ?? 0; break
    case 'avgPerformance': actual = ctx.avgPerformance ?? 0; break
    case 'avgVocal': actual = ctx.avgVocal ?? 0; break
    case 'avgDance': actual = ctx.avgDance ?? 0; break
    default: actual = 0
  }
  switch (op) {
    case '>=': return actual >= value
    case '<=': return actual <= value
    case '>': return actual > value
    case '<': return actual < value
    case '=': return actual === value
    default: return false
  }
}

function calcTeamRating(ctx, teamSize, config) {
  const memberRatings = (ctx && ctx.memberRatings) || []
  const rules = getTeamRatingRules(config, teamSize)
  for (const raw of rules) {
    const rule = normalizeRule(raw)
    const conds = rule.conditions || []
    if (conds.length === 0) {
      return { teamRating: rule.teamRating || 'B', teamRatingText: TEAM_RATING_TEXTS[rule.teamRating || 'B'] }
    }
    const results = conds.map(c => evalCondition(c, ctx))
    const matched = (rule.combine === 'any') ? results.some(Boolean) : results.every(Boolean)
    if (matched) {
      return { teamRating: rule.teamRating || 'B', teamRatingText: TEAM_RATING_TEXTS[rule.teamRating || 'B'] }
    }
  }
  return { teamRating: 'B', teamRatingText: TEAM_RATING_TEXTS.B }
}

// 3.5/3.6 评级加权（S/A/B/C/D，默认 S=1 A=0.9 B=0.8 C=0.7 D=0.6，管理员可改）
function ratingWeight(rating, seasonCfg, kind) {
  const w = seasonCfg && seasonCfg.ratingWeights
    ? (kind === 'personal' ? seasonCfg.ratingWeights.personal : seasonCfg.ratingWeights.team)
    : null
  const map = w || { S: 1, A: 0.9, B: 0.8, C: 0.7, D: 0.6 }
  return map[rating] ?? 1
}

/** 计算团队分和团队评级（带控制台日志） */
function calcTeamScore(memberScores, teamName) {
  if (memberScores.length === 0) return { teamScore: 0, teamRating: 'D', teamRatingText: '失误较多' }
  const teamScore = Math.round(memberScores.reduce((s, v) => s + v, 0) / memberScores.length)
  const { stageRating: teamRating, stageRatingText: teamRatingText } = getStageRating(teamScore)

  console.log('')
  console.log('╔══════════════════════════════════════════════╗')
  console.log(`║  团队得分计算 · ${teamName || '未知队伍'}`)
  console.log(`║  成员个人分: [${memberScores.join(', ')}]`)
  console.log(`║  团队平均分 = (${memberScores.join(' + ')}) / ${memberScores.length} = ${teamScore}`)
  console.log(`║  团队总分 = ${teamScore}`)
  console.log(`║  最终票数 = 1000 位大众评审 yes/no 模拟产生`)
  console.log(`║  评级: ${teamRating}(${teamRatingText})`)
  console.log('╚══════════════════════════════════════════════╝')

  return { teamScore, teamRating, teamRatingText }
}

/** 基于真实大众评审成员，模拟 1000 人对所有舞台的 yes/no 投票 */
async function simulateAudienceVotesForTeams(roundId, teamsData, totalAudience = 1000, globalMaxCharmPerf = 1) {
  // 1. 清空旧团队票和旧评审成员（重算时需要完全重建）
  await AudienceTeamVote.deleteMany({ roundId })
  await AudienceMember.deleteMany({ roundId })

  // 2. 生成 1000 位大众评审成员
  const members = []
  for (let i = 1; i <= totalAudience; i++) {
    const age = randomAge()
    const gender = randomGender()
    members.push({
      id: generateId(),
      roundId,
      seatNumber: i,
      name: randomChineseName(gender),
      gender,
      age,
      occupation: randomOccupation(age)
    })
  }
  const savedMembers = await AudienceMember.insertMany(members)

  // 3. 逐队逐人模拟 yes/no
  const results = []
  for (const team of teamsData) {
    // 3.5 团队得票概率 = (队内发挥后charm均值 + 队内发挥后最高charm) / (2×全体最高发挥后charm) × 团队评级权重
    const denom = 2 * Math.max(1, globalMaxCharmPerf)
    let yesRate = ((team.avgCharmPerf || 0) + (team.maxCharmPerf || 0)) / denom * (team.teamWeight ?? 1)
    yesRate = Math.max(0.05, Math.min(0.95, yesRate))
    // 舞台事件微调：事件票数按千分比转换
    yesRate += (team.eventVotes || 0) / totalAudience
    yesRate = Math.max(0.05, Math.min(0.95, yesRate))

    const teamVotes = []
    let finalVotes = 0
    for (const m of savedMembers) {
      const votedYes = Math.random() < yesRate
      if (votedYes) finalVotes++
      teamVotes.push({
        id: generateId(),
        roundId,
        audienceId: m.id,
        seatNumber: m.seatNumber,
        teamId: team.teamId,
        teamName: team.teamName,
        votedYes,
        createdAt: new Date().toISOString()
      })
    }
    await AudienceTeamVote.insertMany(teamVotes)
    results.push({ teamId: team.teamId, finalVotes, yesRate })
  }

  return results
}

// ====================== POST /api/performance/calculate - 公演结算（新评级体系） ======================

router.post('/calculate', auth, requireAdmin, async (req, res) => {
  try {
    const round = await resolveRound(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次（请传 roundId 或 roundIndex）', code: 'NO_ROUND' })

    // dbRoundId 用于存储到 TeamPerformance/PlayerPerformance（Round 的真实 id）
    // frontRoundId 用于查询 RoundTeam/RoundTeamMember/TeamSong（前端传入的 roundId 格式）
    const dbRoundId = round.id
    const frontRoundId = req.body.roundId || `round-${round.index}`
    const seasonCfg = await getCurrentSeason()

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
    const ratingMap = {}
    for (const pv of performanceValues) {
      perfValueMap[pv.playerId] = pv.performanceValue
      if (pv.rating) ratingMap[pv.playerId] = { rating: pv.rating, roll: pv.ratingRoll }
    }

    // 6. 舞台事件池（保留用于 finalVotes 计算）
    const stageEvents = await StageEvent.find({ enabled: true })

    // 7. 清空旧结果（同时清理用 dbRoundId 和 frontRoundId 存的旧数据）
    await TeamPerformance.deleteMany({ roundId: { $in: [dbRoundId, frontRoundId] } })
    await PlayerPerformance.deleteMany({ roundId: { $in: [dbRoundId, frontRoundId] } })
    // 重算时大众评审成员与投票也需重建，否则团队票与个人票无法一一对应
    await AudienceMember.deleteMany({ roundId: { $in: [dbRoundId, frontRoundId] } })
    await AudienceTeamVote.deleteMany({ roundId: { $in: [dbRoundId, frontRoundId] } })
    await clearAudienceVote(dbRoundId, false).catch(() => {})
    await clearAudienceVote(frontRoundId, false).catch(() => {})

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
        perfValue = randomInt(0, 100)
      }
      const { playerScore, stageRating, stageRatingText, attributeScore, difficultyFactor, performanceBonus, ratingFaces, ratingRoll, ratingMainAttr, ratingBaseMet, ratingSteps, ratingExcess, ratingDeficit, ratingDeficitSteps, ratingMainBase, ratingDifficulty, ratingRisk } =
        calcPlayerScore(u, song, perfValue, ratingMap[m.playerId])

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
          performanceBonus,
          ratingFaces,
          ratingRoll,
          ratingMainAttr,
          ratingBaseMet,
          ratingSteps,
          ratingExcess,
          ratingDeficit,
          ratingDeficitSteps,
          ratingMainBase,
          ratingDifficulty,
          ratingRisk
        })
        memberScores.push(playerScore)
      }

      // 计算团队分（平均分，用于展示）+ 团队评级（3.4 规则判定）
      const teamScore = memberResults.length ? Math.round(memberScores.reduce((s, v) => s + v, 0) / memberScores.length) : 0
      const memberRatings = memberResults.map(m => m.stageRating)
      const ratingCtx = {
        memberRatings,
        teamScore,
        avgCharm: Math.round(memberResults.reduce((s, m) => s + (userMap[m.playerId]?.attributes?.charm || 0), 0) / Math.max(1, memberResults.length)),
        avgVocal: Math.round(memberResults.reduce((s, m) => s + (userMap[m.playerId]?.attributes?.vocal || 0), 0) / Math.max(1, memberResults.length)),
        avgDance: Math.round(memberResults.reduce((s, m) => s + (userMap[m.playerId]?.attributes?.dance || 0), 0) / Math.max(1, memberResults.length)),
        avgPerformance: Math.round(memberResults.reduce((s, m) => s + (m.performanceValue || 0), 0) / Math.max(1, memberResults.length))
      }
      const { teamRating, teamRatingText } = calcTeamRating(ratingCtx, teamMembers.length, seasonCfg && seasonCfg.teamRatingRules)

      // 团队平均魅力（用于最终票数加成）
      const teamCharm = Math.round(memberResults.reduce((s, m) => s + (userMap[m.playerId]?.attributes?.charm || 0), 0) / memberResults.length)

      // 舞台事件：3.7 取消不可见随机抽取，默认无事件（如需请在管理端显式配置）
      let eventVotes = 0
      let eventId = null
      let eventName = ''
      let eventDescription = ''

      // 歌曲权重
      const vw = song.vocalWeight || 3
      const dw = song.danceWeight || 3
      const cw = song.charmWeight || 3

      // 团队平均属性（teamCharm 已在上面算出，此处复用）
      const teamVocal = Math.round(memberResults.reduce((s, m) => s + (userMap[m.playerId]?.attributes?.vocal || 0), 0) / memberResults.length)
      const teamDance = Math.round(memberResults.reduce((s, m) => s + (userMap[m.playerId]?.attributes?.dance || 0), 0) / memberResults.length)

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
        baseVotes: 0,
        attributeVotes: 0,
        performanceVotes: 0,
        compatibilityVotes: 0,
        eventVotes,
        finalVotes: 0,
        finalScore: 0, // 兼容旧字段
        audienceYesRate: 0,
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
          stageRatingText: mr.stageRatingText,
          attributeScore: mr.attributeScore,
          difficultyFactor: mr.difficultyFactor,
          performanceBonus: mr.performanceBonus,
          ratingFaces: mr.ratingFaces || null,
          ratingRoll: mr.ratingRoll ?? null,
          ratingMainAttr: mr.ratingMainAttr || null,
          ratingBaseMet: mr.ratingBaseMet ?? null,
          ratingSteps: mr.ratingSteps ?? 0,
          ratingExcess: mr.ratingExcess ?? 0,
          ratingDeficit: mr.ratingDeficit ?? 0,
          ratingDeficitSteps: mr.ratingDeficitSteps ?? 0,
          ratingMainBase: mr.ratingMainBase ?? 0,
          ratingDifficulty: mr.ratingDifficulty ?? 0,
          ratingRisk: mr.ratingRisk ?? 0
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

    // 读取管理员配置的得票率除数（默认150）
    const perfState = await PerformanceRoundState.findOne({ roundId: dbRoundId })
    const yesRateDenominator = perfState && perfState.yesRateDenominator ? perfState.yesRateDenominator : 150

    // 3.5 发挥成绩排名 → 本次公演 charm 加成（仅本次，不改属性）
    // 反应力(ms)/用时类（秒）越小越好；其余成绩越大越好
    const LOWER_BETTER_MODES = ['reflex', 'memory', 'bomb', 'spot_diff', 'math']
    const lowerBetter = LOWER_BETTER_MODES.includes(perfState && perfState.generationMode)
    const bonusCfg = (seasonCfg && seasonCfg.performanceBonus) || { p1: 0.2, p2: 0.1, p3: 0, p4: -0.1, p5: -0.2 }
    const ranked = allPlayerResults
      .map(r => ({ playerId: r.playerId, pv: r.performanceValue ?? 0 }))
      .sort((a, b) => lowerBetter ? a.pv - b.pv : b.pv - a.pv)
    const rankedTotal = ranked.length || 1
    const charmAfterPerf = {}
    ranked.forEach((r, i) => {
      const pct = i / rankedTotal
      let bonus = bonusCfg.p3 ?? 0
      if (pct < 0.2) bonus = bonusCfg.p1 ?? 0.2
      else if (pct < 0.4) bonus = bonusCfg.p2 ?? 0.1
      else if (pct < 0.6) bonus = bonusCfg.p3 ?? 0
      else if (pct < 0.8) bonus = bonusCfg.p4 ?? -0.1
      else bonus = bonusCfg.p5 ?? -0.2
      const charm = userMap[r.playerId]?.attributes?.charm || 0
      charmAfterPerf[r.playerId] = Math.max(0, charm * (1 + bonus))
    })
    const globalMaxCharmPerf = Math.max(1, ...Object.values(charmAfterPerf).map(v => Number(v) || 0))

    // 生成 1000 位大众评审成员，并逐队逐人模拟 yes/no 投票
    const teamsData = teamResults.map(tr => {
      const memberIds = (tr.memberPerformances || []).map(mp => mp.playerId)
      const vals = memberIds.map(id => charmAfterPerf[id] || 0)
      const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
      const max = vals.length ? Math.max(...vals) : 0
      return {
        teamId: tr.teamId,
        teamName: tr.teamName,
        avgCharmPerf: avg,
        maxCharmPerf: max,
        teamWeight: ratingWeight(tr.teamRating, seasonCfg, 'team'),
        eventVotes: tr.eventVotes || 0
      }
    })
    const audienceVoteResults = await simulateAudienceVotesForTeams(dbRoundId, teamsData, 1000, globalMaxCharmPerf)
    const resultMap = {}
    for (const r of audienceVoteResults) resultMap[r.teamId] = r
    for (const tr of teamResults) {
      const r = resultMap[tr.teamId]
      const td = teamsData.find(t => t.teamId === tr.teamId)
      if (r) {
        tr.finalVotes = r.finalVotes
        tr.finalScore = r.finalVotes
        tr.attributeVotes = r.finalVotes
        tr.audienceYesRate = r.yesRate
      }
      if (td) {
        tr.avgCharmPerf = td.avgCharmPerf
        tr.maxCharmPerf = td.maxCharmPerf
        tr.teamRatingWeight = td.teamWeight
        tr.globalMaxCharmPerf = globalMaxCharmPerf
      }
    }

    // 名次（rank）按公演票数计算，用于最终排名；但数组顺序按队伍序号（teamId 尾号 team-1/team-2/...）排列，
    // 保证队伍总览不提前暴露按分数高低的排名，保留悬念。
    const rankedByVotes = [...teamResults].sort((a, b) => b.finalVotes - a.finalVotes)
    for (let i = 0; i < rankedByVotes.length; i++) rankedByVotes[i].rank = i + 1
    for (const tr of teamResults) {
      const found = rankedByVotes.find(x => x.teamId === tr.teamId)
      if (found) tr.rank = found.rank
    }
    const teamSeqNum = (teamId) => {
      const m = String(teamId || '').match(/-team-(\d+)$/)
      return m ? parseInt(m[1]) : 99999
    }
    teamResults.sort((a, b) => teamSeqNum(a.teamId) - teamSeqNum(b.teamId))

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
        audienceYesRate: tr.audienceYesRate,
        avgCharmPerf: tr.avgCharmPerf,
        maxCharmPerf: tr.maxCharmPerf,
        teamRatingWeight: tr.teamRatingWeight,
        globalMaxCharmPerf: tr.globalMaxCharmPerf,
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

    // 生成大众评审个人喜爱度投票（复用已生成的 1000 位成员）
    let audienceVoteResult = null
    try {
      audienceVoteResult = await generateAudienceVoteForRound(round, { reuseMembers: true })
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
        avgCharmPerf: o.avgCharmPerf ?? 0,
        maxCharmPerf: o.maxCharmPerf ?? 0,
        teamRatingWeight: o.teamRatingWeight ?? 1,
        globalMaxCharmPerf: o.globalMaxCharmPerf ?? 0,
        audienceYesRate: o.audienceYesRate ?? 0,
        songWeights: o.songWeights || { vocal: 0.34, dance: 0.33, charm: 0.33 },
        teamAttributes: o.teamAttributes || { vocal: 0, dance: 0, charm: 0 },
        playerPerformances: ((o.memberPerformances && o.memberPerformances.length)
          ? [...o.memberPerformances].sort((a, b) => (b.playerScore || 0) - (a.playerScore || 0))
          : teamPlayerResults
        ).map((p, idx) => ({
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
          rankInTeam: p.rankInTeam || (idx + 1),
          attributeScore: p.attributeScore || 0,
          difficultyFactor: p.difficultyFactor || 0,
          performanceBonus: p.performanceBonus ?? 0,
          ratingFaces: p.ratingFaces || null,
          ratingRoll: p.ratingRoll ?? null,
          ratingMainAttr: p.ratingMainAttr || null,
          ratingBaseMet: p.ratingBaseMet ?? null,
          ratingSteps: p.ratingSteps ?? 0,
          ratingExcess: p.ratingExcess ?? 0,
          ratingDeficit: p.ratingDeficit ?? 0,
          ratingDeficitSteps: p.ratingDeficitSteps ?? 0,
          ratingMainBase: p.ratingMainBase ?? 0,
          ratingDifficulty: p.ratingDifficulty ?? 0,
          ratingRisk: p.ratingRisk ?? 0
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

router.get('/result', auth, async (req, res) => {
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

    const season = await getCurrentSeason()

    // 兼容旧结算数据：若团队战绩缺少得票率分量，则即时补算
    const needBackfill = teamPerf.some(tp => tp.avgCharmPerf == null || tp.teamRatingWeight == null)
    let backfillGlobalMaxCharmPerf = 0
    const charmPerfMap = {}
    if (needBackfill) {
      const [pvs, perfState] = await Promise.all([
        PerformanceValue.find({ roundId: teamPerf[0].roundId }),
        PerformanceRoundState.findOne({ roundId: teamPerf[0].roundId })
      ])
      const lower = ['reflex', 'memory', 'bomb', 'spot_diff', 'math'].includes(perfState && perfState.generationMode)
      const list = pvs.filter(v => Number.isFinite(Number(v.performanceValue))).map(v => ({ playerId: v.playerId, pv: Number(v.performanceValue) }))
      list.sort((a, b) => lower ? a.pv - b.pv : b.pv - a.pv)
      const total = list.length || 1
      const cfg = (season && season.performanceBonus) || { p1: 0.2, p2: 0.1, p3: 0, p4: -0.1, p5: -0.2 }
      list.forEach((x, i) => {
        const pct = i / total
        let b = cfg.p3 ?? 0
        if (pct < 0.2) b = cfg.p1 ?? 0.2
        else if (pct < 0.4) b = cfg.p2 ?? 0.1
        else if (pct < 0.6) b = cfg.p3 ?? 0
        else if (pct < 0.8) b = cfg.p4 ?? -0.1
        else b = cfg.p5 ?? -0.2
        const charm = userMap[x.playerId]?.attributes?.charm || 0
        charmPerfMap[x.playerId] = Math.max(0, charm * (1 + b))
      })
      backfillGlobalMaxCharmPerf = Math.max(1, ...Object.values(charmPerfMap).map(Number))
    }

    // 读时补算评级明细（兼容旧数据）：从歌曲 + 选手属性重算骰面构成
    const songIds = [...new Set(teamPerf.map(t => t.songId).filter(Boolean))]
    const songs = songIds.length ? await Song.find({ id: { $in: songIds } }) : []
    const songMap = {}
    for (const s of songs) songMap[s.id] = s

    // 队伍详细数据
    const teamsData = teamPerf.map(tp => {
      const o = tp.toObject()
      delete o._id
      const teamPlayers = playerPerf.filter(p => p.teamId === tp.teamId).sort((a, b) => (a.rankInTeam || 999) - (b.rankInTeam || 999))
      const memberVals = (o.memberPerformances || []).map(m => charmPerfMap[m.playerId] || 0)
      const song = songMap[o.songId] || null
      const memberPerformances = (o.memberPerformances || []).map(m => {
        const u = userMap[m.playerId]
        if (!u || !song) return m
        const f = computeRatingFaces(u, song)
        return {
          ...m,
          ratingMainAttr: f.mainAttr,
          ratingDifficulty: f.difficulty,
          ratingRisk: f.risk,
          ratingMainBase: f.mainBase,
          ratingBaseMet: f.baseMet,
          ratingSteps: f.steps,
          ratingExcess: f.excess,
          ratingDeficit: f.deficit,
          ratingDeficitSteps: f.deficitSteps,
          ratingFaces: f.faces
        }
      })
      return {
        ...o,
        memberPerformances,
        avgCharmPerf: o.avgCharmPerf != null ? o.avgCharmPerf : (memberVals.length ? memberVals.reduce((s, v) => s + v, 0) / memberVals.length : 0),
        maxCharmPerf: o.maxCharmPerf != null ? o.maxCharmPerf : (memberVals.length ? Math.max(...memberVals) : 0),
        globalMaxCharmPerf: o.globalMaxCharmPerf != null ? o.globalMaxCharmPerf : backfillGlobalMaxCharmPerf,
        teamRatingWeight: o.teamRatingWeight != null ? o.teamRatingWeight : ratingWeight(o.teamRating, season, 'team'),
        players: teamPlayers.map(p => {
          const po = p.toObject()
          delete po._id
          po.avatar = userMap[p.playerId]?.avatar || null
          return po
        })
      }
    })

    // 留悬念：结果展示顺序按队伍序号（teamId 尾号 team-1/team-2/...，即队伍设立/队长选举顺序）排列，
    // 而不是按得票/名次高低，避免提前暴露排名。名次字段（rank）保持不变供最终排名使用。
    const teamSeq = (teamId) => {
      const m = String(teamId || '').match(/-team-(\d+)$/)
      return m ? parseInt(m[1]) : 99999
    }
    teamsData.sort((a, b) => teamSeq(a.teamId) - teamSeq(b.teamId))

    // 安全/危险队伍（直接用 resolveRoundFromQuery 返回的 round，避免重新查询）
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

    const { roundId, generationMode } = req.body
    const frontRoundId = roundId || `round-${round.index}`
    const mode = ['random', 'pointer', 'speed', 'strategy', 'reflex', 'memory', 'bomb', 'spot_diff', 'math'].includes(generationMode) ? generationMode : 'random'

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
      generationMode: mode,
      revealedTeamIds: [],
      updatedAt: new Date().toISOString()
    })
    await state.save()

    await logAction(req.user.userId, req.user.name || 'admin', 'admin', 'PERFORMANCE_START', 'round', round.id, `开启第 ${round.index} 轮公演`)

    // 发挥值已在并发阶段抽取，公演开启时不再清空（保留选手已抽取的值）

    res.json({ success: true, message: '公演已开启，选手端可开始生成发挥值', roundId: round.id, roundIndex: round.index, generationMode: mode })
  } catch (e) {
    console.error('Start performance error:', e)
    res.status(500).json({ success: false, error: '开启公演失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/performance/generation-mode - 设置本轮发挥值生成方式 =====
router.post('/generation-mode', auth, requireAdmin, async (req, res) => {
  try {
    const round = await resolveRound(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次', code: 'NO_ROUND' })

    const { generationMode } = req.body
    if (!['random', 'pointer', 'speed', 'strategy', 'reflex', 'memory', 'bomb', 'spot_diff', 'math'].includes(generationMode)) {
      return res.status(400).json({ success: false, error: '生成方式只能是 random/pointer/speed/strategy/reflex', code: 'INVALID_MODE' })
    }

    let state = await PerformanceRoundState.findOne({ roundId: round.id })
    // 发挥值抽取提前到并发阶段，生成方式可随时设定（不再受公演是否已开启限制）
    if (!state) {
      state = new PerformanceRoundState({
        id: generateId(),
        roundId: round.id,
        roundIndex: round.index,
        started: false,
        generationMode,
        revealedTeamIds: [],
        updatedAt: new Date().toISOString()
      })
    } else {
      state.generationMode = generationMode
      state.updatedAt = new Date().toISOString()
    }
    await state.save()

    res.json({ success: true, data: { roundId: round.id, roundIndex: round.index, generationMode } })
  } catch (e) {
    console.error('Set generation mode error:', e)
    res.status(500).json({ success: false, error: '设置生成方式失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/performance/config - 保存公演结算配置（如队伍得票率除数） =====
router.post('/config', auth, requireAdmin, async (req, res) => {
  try {
    const round = await resolveRound(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次', code: 'NO_ROUND' })

    const { yesRateDenominator } = req.body
    const denom = parseInt(yesRateDenominator)
    if (isNaN(denom) || denom < 1 || denom > 10000) {
      return res.status(400).json({ success: false, error: 'yesRateDenominator 必须为 1-10000 之间的整数', code: 'INVALID_PARAMS' })
    }

    let state = await PerformanceRoundState.findOne({ roundId: round.id })
    if (!state) {
      state = new PerformanceRoundState({
        id: generateId(),
        roundId: round.id,
        roundIndex: round.index,
        started: false,
        generationMode: 'random',
        revealedTeamIds: [],
        updatedAt: new Date().toISOString()
      })
    }
    state.yesRateDenominator = denom
    state.updatedAt = new Date().toISOString()
    await state.save()

    res.json({ success: true, data: { roundId: round.id, roundIndex: round.index, yesRateDenominator: denom } })
  } catch (e) {
    console.error('Set performance config error:', e)
    res.status(500).json({ success: false, error: '保存公演配置失败', code: 'SERVER_ERROR' })
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

    const value = randomInt(0, 100)
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

    // 生成成绩：支持手动指定或随机（不做裁剪，口径因玩法而异）
    const value = typeof manualValue === 'number' ? manualValue : randomInt(0, 100)

    // 查找选手所在队伍（兼容两种 roundId 格式）
    const frontRoundId = roundId
    const roundIdFilter = rId !== frontRoundId
      ? { $or: [{ roundId: rId }, { roundId: frontRoundId }] }
      : { roundId: rId }
    const member = await RoundTeamMember.findOne({ ...roundIdFilter, playerId })

    // 覆盖式保存（保留已有 rating，避免抽成绩清掉评级）
    let pv = await PerformanceValue.findOne({ roundId: rId, playerId })
    if (!pv) {
      pv = new PerformanceValue({
        id: generateId(), roundId: rId, roundIndex: round.index,
        playerId, teamId: member ? member.teamId : null, performanceValue: value,
        generatedAt: new Date().toISOString()
      })
    } else {
      pv.performanceValue = value
      if (member) pv.teamId = member.teamId
      pv.generatedAt = new Date().toISOString()
    }
    await pv.save()

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

    // 依据本轮玩法方向，把"未生成"的选手安排到已有成绩之后（垫底），且彼此名次随机
    const state = await PerformanceRoundState.findOne({ roundId: round.id })
    const genMode = state ? state.generationMode : 'random'
    const LOWER_BETTER = ['reflex', 'memory', 'bomb', 'spot_diff', 'math']
    const lowerBetter = LOWER_BETTER.includes(genMode)
    const existingNums = existingValues
      .map(v => Number(v.performanceValue))
      .filter(n => Number.isFinite(n))

    let range = { min: 0, max: 100 }
    if (existingNums.length > 0) {
      if (lowerBetter) {
        // 越小越好 → 未生成的给更大的成绩（垫底）
        const maxExisting = Math.floor(Math.max(...existingNums))
        range = { min: maxExisting + 1, max: maxExisting + 30 }
      } else {
        // 越大越好 → 未生成的给更小的成绩（垫底），且不超过已有最低分
        const minExisting = Math.floor(Math.min(...existingNums))
        const hi = minExisting - 1
        range = hi >= 0 ? { min: 0, max: hi } : { min: 0, max: 0 }
      }
    }

    const created = []
    const skipped = []
    for (const m of members) {
      if (existingPlayerIds.has(m.playerId)) {
        skipped.push({ playerId: m.playerId, performanceValue: existingValues.find(v => v.playerId === m.playerId)?.performanceValue })
        continue
      }
      const value = range.max > range.min ? randomInt(range.min, range.max) : range.min
      await createPerformanceValue({ roundId: round.id, roundIndex: round.index, playerId: m.playerId, teamId: m.teamId, value })
      created.push({ playerId: m.playerId, performanceValue: value, performanceText: getPerformanceText(value) })
    }

    res.json({ success: true, data: { generatedCount: created.length, skippedCount: skipped.length, mode: genMode, range, players: [...created, ...skipped] } })
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
    const generationMode = state ? state.generationMode : 'random'

    // 兼容 roundId 查询：使用 DB UUID 和前端 roundId 两种格式
    const frontRoundId = queryRoundId || `round-${round.index}`
    const roundIdFilter = round.id !== frontRoundId
      ? { $or: [{ roundId: round.id }, { roundId: frontRoundId }] }
      : { roundId: round.id }

    // 所有选手（含未入队：未入队选手也能抽取发挥值）
    const members = await RoundTeamMember.find(roundIdFilter)
    // 建立 playerId → teamId 映射（未入队的没有）
    const teamIdByPlayer = {}
    for (const m of members) {
      if (!teamIdByPlayer[m.playerId]) teamIdByPlayer[m.playerId] = m.teamId
    }
    const allActiveUsers = await User.find({ role: { $ne: 'admin' }, status: { $ne: 'eliminated' } })
    const userIds = [...new Set(allActiveUsers.map(u => u.id))]
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
    const ratingMap = {}
    for (const v of values) {
      valueMap[v.playerId] = v.performanceValue
      ratingMap[v.playerId] = { rating: v.rating || null, roll: v.ratingRoll ?? null, faces: v.ratingFaces || null, mainAttr: v.ratingMainAttr || null }
    }

    const players = allActiveUsers.map(u => {
      const teamId = teamIdByPlayer[u.id] || null
      return {
        playerId: u.id,
        playerName: userMap[u.id] ? userMap[u.id].name : u.name,
        teamId,
        teamName: teamId && teamMap[teamId] ? teamMap[teamId].name : null,
        generated: generatedSet.has(u.id),
        performanceValue: valueMap[u.id] != null ? valueMap[u.id] : null,
        rating: ratingMap[u.id] ? ratingMap[u.id].rating : null,
        ratingRoll: ratingMap[u.id] ? ratingMap[u.id].roll : null,
        ratingFaces: ratingMap[u.id] ? ratingMap[u.id].faces : null,
        ratingMainAttr: ratingMap[u.id] ? ratingMap[u.id].mainAttr : null
      }
    })

    res.json({
      success: true,
      started,
      generationMode,
      players
    })
  } catch (e) {
    console.error('Get player status error:', e)
    res.status(500).json({ success: false, error: '获取选手状态失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/performance/player-status/save - 批量保存/覆盖选手发挥值 =====
router.post('/player-status/save', auth, async (req, res) => {
  try {
    const { roundId, players } = req.body
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    if (!Array.isArray(players)) return res.status(400).json({ success: false, error: 'players 必须是数组', code: 'INVALID_PARAMS' })

    const round = await resolveRound(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次（请传 roundId 或 roundIndex）', code: 'NO_ROUND' })

    for (const p of players) {
      // performanceValue 为 null 表示未生成，跳过
      if (p.performanceValue === null || p.performanceValue === undefined) continue

      // 成绩口径因玩法而异（0~100 / 点击次数 / ms / 秒），不做裁剪
      const perfVal = Number(p.performanceValue)
      if (!Number.isFinite(perfVal)) continue

      // 覆盖式保存（保留已有 rating 等字段，避免抽成绩时清掉评级）
      let pv = await PerformanceValue.findOne({ roundId: round.id, playerId: p.playerId })
      if (!pv) {
        pv = new PerformanceValue({
          id: generateId(),
          roundId: round.id,
          roundIndex: round.index,
          playerId: p.playerId,
          teamId: p.teamId || null,
          performanceValue: perfVal,
          generatedAt: new Date().toISOString()
        })
      } else {
        pv.performanceValue = perfVal
        if (p.teamId) pv.teamId = p.teamId
        pv.generatedAt = new Date().toISOString()
      }
      await pv.save()
    }

    res.json({ success: true })
  } catch (e) {
    console.error('Save player status error:', e)
    res.status(500).json({ success: false, error: '保存选手发挥值失败', code: 'SERVER_ERROR' })
  }
})

// ===== DELETE /api/performance/player-status - 撤回发挥值（支持单个/批量/全部） =====
// body: { roundId, playerIds?: string[] }  不传 playerIds 表示撤回全部
router.delete('/player-status', auth, requireAdmin, async (req, res) => {
  try {
    const body = req.body || {}
    const roundId = body.roundId || req.query.roundId
    const playerIds = Array.isArray(body.playerIds) ? body.playerIds : null
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })

    const round = await resolveRound(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次（请传 roundId 或 roundIndex）', code: 'NO_ROUND' })

    const filter = { roundId: round.id }
    if (playerIds && playerIds.length > 0) {
      filter.playerId = { $in: playerIds }
    }

    const result = await PerformanceValue.deleteMany(filter)

    res.json({
      success: true,
      data: {
        deletedCount: result.deletedCount || 0,
        roundId: round.id,
        playerIds: playerIds || []
      }
    })
  } catch (e) {
    console.error('Delete player status error:', e)
    res.status(500).json({ success: false, error: '撤回发挥值失败', code: 'SERVER_ERROR' })
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
    const generationMode = state ? state.generationMode : 'random'
    const yesRateDenominator = state && state.yesRateDenominator ? state.yesRateDenominator : 150

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
        generationMode,
        yesRateDenominator,
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
        generationMode: 'random',
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

    res.json({ success: true, data: { opened: true, started: state.started, generationMode: state.generationMode || 'random' } })
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
// ===== 3.3 选手点击掷骰，得到个人评级（并持久化，结算时复用）=====
router.post('/roll-rating', auth, async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const curRound = season.currentRound
    let round = null
    if (req.body?.roundId) round = await Round.findOne({ id: req.body.roundId })
    if (!round) round = await Round.findOne({ seasonId: season.id, index: curRound })
    const dbRoundId = round ? round.id : `round-${curRound}`
    const frontRoundId = `round-${round ? round.index : curRound}`
    const roundFilter = { $in: [dbRoundId, frontRoundId] }
    const uid = req.user.userId
    const user = await User.findOne({ id: uid })
    if (!user) return res.status(404).json({ success: false, error: '用户不存在', code: 'NOT_FOUND' })

    // 需要先在训练页确认训练结束，才能投掷公演骰子
    const trStatus = await TrainingStatus.findOne({ roundId: { $in: [dbRoundId, frontRoundId] }, playerId: uid })
    if (!trStatus || !trStatus.finished) {
      return res.status(400).json({ success: false, error: '请先在训练页点击「确定训练结束」，之后才能投掷公演骰子', code: 'TRAINING_NOT_FINISHED' })
    }

    const tm = await RoundTeamMember.findOne({ playerId: uid, roundId: roundFilter })
    if (!tm) return res.status(400).json({ success: false, error: '你本轮尚未分组，无法进行公演评级', code: 'NO_TEAM' })
    const ts = await TeamSong.findOne({ teamId: tm.teamId, roundId: roundFilter })
    if (!ts) return res.status(400).json({ success: false, error: '你的队伍尚未选择歌曲', code: 'NO_SONG' })
    const song = await Song.findOne({ id: ts.songId })
    if (!song) return res.status(400).json({ success: false, error: '歌曲不存在', code: 'SONG_NOT_FOUND' })

    let pv = await PerformanceValue.findOne({ roundId: dbRoundId, playerId: uid })
    if (pv && pv.rating) {
      // 已经投掷过，直接返回结果（选手只能点一次）
      return res.json({
        success: true,
        data: {
          alreadyRolled: true,
          rating: pv.rating,
          ratingText: RATING_TEXTS[pv.rating] || pv.rating,
          roll: pv.ratingRoll ?? null,
          difficulty: (pv.ratingFaces && pv.ratingFaces.difficulty) || (song.difficulty || 3),
          faces: pv.ratingFaces || null,
          mainAttr: pv.ratingMainAttr || null,
          songName: song.name
        }
      })
    }

    const result = rollPlayerRating(user, song)
    if (!pv) {
      pv = new PerformanceValue({
        id: generateId(), roundId: dbRoundId, roundIndex: curRound,
        playerId: uid, teamId: tm.teamId, performanceValue: null,
        generatedAt: new Date().toISOString()
      })
    }
    pv.rating = result.rating
    pv.ratingRoll = result.roll
    pv.ratingFaces = result.faces
    pv.ratingMainAttr = result.mainAttr
    pv.rolledAt = new Date().toISOString()
    await pv.save()

    res.json({
      success: true,
      data: {
        rating: result.rating,
        ratingText: result.ratingText,
        roll: result.roll,
        difficulty: result.difficulty,
        faces: result.faces,
        mainAttr: result.mainAttr,
        baseMet: result.baseMet,
        steps: result.steps,
        songName: song.name
      }
    })
  } catch (e) {
    console.error('roll-rating error:', e)
    res.status(500).json({ success: false, error: '掷骰失败', code: 'SERVER_ERROR' })
  }
})

// ===== 3.3 选手端：获取本人公演骰子信息（训练结束后可投）=====
router.get('/my-rating-info', auth, async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const curRound = season.currentRound
    const round = await Round.findOne({ seasonId: season.id, index: curRound })
    const dbRoundId = round ? round.id : `round-${curRound}`
    const frontRoundId = `round-${round ? round.index : curRound}`
    const roundFilter = { $in: [dbRoundId, frontRoundId] }
    const uid = req.user.userId

    const st = await TrainingStatus.findOne({ roundId: { $in: [dbRoundId, frontRoundId] }, playerId: uid })
    const user = await User.findOne({ id: uid })
    const tm = await RoundTeamMember.findOne({ playerId: uid, roundId: roundFilter })
    const ts = tm ? await TeamSong.findOne({ teamId: tm.teamId, roundId: roundFilter }) : null
    const song = ts ? await Song.findOne({ id: ts.songId }) : null
    const pv = await PerformanceValue.findOne({ roundId: dbRoundId, playerId: uid })

    let faces = null
    if (user && song) {
      const f = computeRatingFaces(user, song)
      faces = {
        mainAttr: f.mainAttr, difficulty: f.difficulty, risk: f.risk,
        baseVocal: f.baseVocal, baseDance: f.baseDance, mainBase: f.mainBase,
        baseMet: f.baseMet, excess: f.excess, steps: f.steps, faces: f.faces
      }
    }

    res.json({
      success: true,
      data: {
        finished: !!(st && st.finished),
        finishedAt: st ? st.finishedAt : null,
        hasTeam: !!tm,
        hasSong: !!ts,
        song: song ? {
          id: song.id, name: song.name, difficulty: song.difficulty || 3, risk: song.risk ?? 10,
          mainAttribute: song.mainAttribute || 'vocal', baseVocal: song.baseVocal ?? 30, baseDance: song.baseDance ?? 30
        } : null,
        faces,
        rating: pv ? (pv.rating || null) : null,
        roll: pv ? (pv.ratingRoll ?? null) : null
      }
    })
  } catch (e) {
    console.error('my-rating-info error:', e)
    res.status(500).json({ success: false, error: '获取公演骰子信息失败', code: 'SERVER_ERROR' })
  }
})

// ===== 3.3 管理员查看所有选手掷骰情况 =====
router.get('/ratings', auth, requireAdmin, async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const curRound = season.currentRound
    let round = null
    if (req.query?.roundId) round = await Round.findOne({ id: req.query.roundId })
    if (!round) round = await Round.findOne({ seasonId: season.id, index: curRound })
    const dbRoundId = round ? round.id : `round-${curRound}`
    const frontRoundId = `round-${round ? round.index : curRound}`
    const roundFilter = { $in: [dbRoundId, frontRoundId] }

    const players = (await User.find({ role: { $ne: 'admin' } })).filter(u => u.status !== 'eliminated')
    const members = await RoundTeamMember.find({ roundId: roundFilter })
    const memberMap = {}
    for (const m of members) memberMap[m.playerId] = m
    const teamIds = [...new Set(members.map(m => m.teamId))]
    const teams = teamIds.length ? await RoundTeam.find({ id: { $in: teamIds } }) : []
    const teamMap = {}
    for (const t of teams) teamMap[t.id] = t
    const teamSongs = await TeamSong.find({ roundId: roundFilter })
    const teamSongMap = {}
    for (const ts of teamSongs) teamSongMap[ts.teamId] = ts
    const songIds = [...new Set(teamSongs.map(ts => ts.songId))]
    const songs = songIds.length ? await Song.find({ id: { $in: songIds } }) : []
    const songMap = {}
    for (const s of songs) songMap[s.id] = s
    const pvs = await PerformanceValue.find({ roundId: dbRoundId })
    const pvMap = {}
    for (const pv of pvs) pvMap[pv.playerId] = pv

    const list = players.map(u => {
      const tm = memberMap[u.id]
      const ts = tm ? teamSongMap[tm.teamId] : null
      const song = ts ? songMap[ts.songId] : null
      const pv = pvMap[u.id]
      let faces = null
      if (song) {
        const f = computeRatingFaces(u, song)
        faces = {
          mainAttr: f.mainAttr,
          difficulty: f.difficulty,
          risk: f.risk,
          baseVocal: f.baseVocal,
          baseDance: f.baseDance,
          mainBase: f.mainBase,
          baseMet: f.baseMet,
          excess: f.excess,
          steps: f.steps,
          faces: f.faces
        }
      }
      return {
        playerId: u.id,
        playerName: u.name,
        teamId: tm ? tm.teamId : null,
        teamName: (tm && teamMap[tm.teamId]) ? teamMap[tm.teamId].name : '',
        songId: song ? song.id : null,
        songName: song ? song.name : '',
        difficulty: song ? (song.difficulty || 3) : null,
        risk: song ? (song.risk ?? null) : null,
        faces,
        hasTeam: !!tm,
        hasSong: !!ts,
        rating: pv ? (pv.rating || null) : null,
        ratingRoll: pv ? (pv.ratingRoll ?? null) : null,
        rolledAt: pv ? (pv.rolledAt || null) : null
      }
    })
    res.json({ success: true, data: { roundId: dbRoundId, list } })
  } catch (e) {
    console.error('ratings list error:', e)
    res.status(500).json({ success: false, error: '获取掷骰情况失败', code: 'SERVER_ERROR' })
  }
})

// ===== 3.3 管理员代理掷骰 =====
router.post('/roll-rating-admin', auth, requireAdmin, async (req, res) => {
  try {
    const { playerId, roundId: reqRoundId } = req.body || {}
    if (!playerId) return res.status(400).json({ success: false, error: '缺少 playerId', code: 'INVALID_PARAMS' })
    const season = await getCurrentSeason()
    const curRound = season.currentRound
    let round = null
    if (reqRoundId) round = await Round.findOne({ id: reqRoundId })
    if (!round) round = await Round.findOne({ seasonId: season.id, index: curRound })
    const dbRoundId = round ? round.id : `round-${curRound}`
    const frontRoundId = `round-${round ? round.index : curRound}`
    const roundFilter = { $in: [dbRoundId, frontRoundId] }

    const user = await User.findOne({ id: playerId })
    if (!user) return res.status(404).json({ success: false, error: '用户不存在', code: 'NOT_FOUND' })
    const tm = await RoundTeamMember.findOne({ playerId, roundId: roundFilter })
    if (!tm) return res.status(400).json({ success: false, error: '该选手本轮尚未分组', code: 'NO_TEAM' })
    const ts = await TeamSong.findOne({ teamId: tm.teamId, roundId: roundFilter })
    if (!ts) return res.status(400).json({ success: false, error: '该队伍尚未选择歌曲', code: 'NO_SONG' })
    const song = await Song.findOne({ id: ts.songId })
    if (!song) return res.status(400).json({ success: false, error: '歌曲不存在', code: 'SONG_NOT_FOUND' })

    const result = rollPlayerRating(user, song)
    let pv = await PerformanceValue.findOne({ roundId: dbRoundId, playerId })
    if (!pv) {
      pv = new PerformanceValue({
        id: generateId(), roundId: dbRoundId, roundIndex: curRound,
        playerId, teamId: tm.teamId, performanceValue: null, generatedAt: new Date().toISOString()
      })
    }
    pv.rating = result.rating
    pv.ratingRoll = result.roll
    pv.ratingFaces = result.faces
    pv.ratingMainAttr = result.mainAttr
    pv.rolledAt = new Date().toISOString()
    await pv.save()
    res.json({
      success: true,
      data: {
        playerId, playerName: user.name,
        rating: result.rating, ratingText: result.ratingText,
        roll: result.roll, songName: song.name
      }
    })
  } catch (e) {
    console.error('admin roll-rating error:', e)
    res.status(500).json({ success: false, error: '代理掷骰失败', code: 'SERVER_ERROR' })
  }
})

// ===== 3.4 团队评级规则配置（管理员）=====
router.get('/team-rating-rules', auth, requireAdmin, async (req, res) => {
  try {
    const season = await getCurrentSeason()
    res.json({
      success: true,
      data: { rules: (season && season.teamRatingRules) || DEFAULT_TEAM_RATING_RULES, defaults: DEFAULT_TEAM_RATING_RULES }
    })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取失败', code: 'SERVER_ERROR' })
  }
})

router.put('/team-rating-rules', auth, requireAdmin, async (req, res) => {
  try {
    const { rules } = req.body || {}
    if (!rules || typeof rules !== 'object') return res.status(400).json({ success: false, error: 'rules 必填', code: 'INVALID_PARAMS' })
    const season = await getCurrentSeason()
    if (!season) return res.status(500).json({ success: false, error: '赛季不存在', code: 'NO_SEASON' })
    season.teamRatingRules = rules
    season.updatedAt = new Date().toISOString()
    await season.save()
    res.json({ success: true, data: { rules } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '保存失败', code: 'SERVER_ERROR' })
  }
})

router.post('/reveal-team', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, teamId } = req.body
    if (!roundId || !teamId) return res.status(400).json({ success: false, error: 'roundId 和 teamId 必填', code: 'INVALID_PARAMS' })

    const round = await resolveRoundFromQuery(req)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    // 若返回虚拟对象（无 seasonId），按 index 补查真实 Round
    const realRound = await Round.findOne({ id: round.id })
    const roundForQuery = realRound || (round.index != null ? await Round.findOne({ index: round.index }) : null) || round

    // 获取队伍信息
    const team = await RoundTeam.findOne({ id: teamId })
    if (!team) return res.status(404).json({ success: false, error: '队伍不存在', code: 'TEAM_NOT_FOUND' })

    // 获取歌曲
    const teamSong = await TeamSong.findOne({ roundId: roundForQuery.id, teamId })
    const song = teamSong ? await Song.findOne({ id: teamSong.songId }) : null
    if (!song) return res.status(400).json({ success: false, error: '该队伍未分配歌曲', code: 'NO_SONG' })

    // 获取成员发挥值
    const members = await RoundTeamMember.find({ roundId: roundForQuery.id, teamId })
    const values = await PerformanceValue.find({ roundId: roundForQuery.id, teamId })
    const valueMap = {}
    for (const v of values) valueMap[v.playerId] = v.performanceValue

    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    // 使用新公式计算每位成员的个人分和评级
    const membersWithPerf = members.map(m => {
      const u = userMap[m.playerId]
      if (!u) return null
      const perfValue = valueMap[m.playerId] ?? randomInt(0, 100) // 未生成则随机补一个
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
    const memberRatings = membersWithPerf.map(m => m.stageRating)
    const seasonCfg2 = await getCurrentSeason()
    const teamScore = memberScores.length ? Math.round(memberScores.reduce((s, v) => s + v, 0) / memberScores.length) : 0
    const { teamRating, teamRatingText } = calcTeamRating({ memberRatings, teamScore }, membersWithPerf.length, seasonCfg2 && seasonCfg2.teamRatingRules)

    // 持久化揭晓状态：将本队加入 PerformanceRoundState.revealedTeamIds（选手端据此逐步展示）
    try {
      let state = await PerformanceRoundState.findOne({ roundId: roundForQuery.id })
      if (!state) {
        state = new PerformanceRoundState({
          id: generateId(),
          roundId: roundForQuery.id,
          roundIndex: roundForQuery.index,
          started: false,
          generationMode: 'random',
          revealedTeamIds: [],
          updatedAt: new Date().toISOString()
        })
      }
      if (!Array.isArray(state.revealedTeamIds)) state.revealedTeamIds = []
      if (!state.revealedTeamIds.includes(teamId)) {
        state.revealedTeamIds.push(teamId)
      }
      state.updatedAt = new Date().toISOString()
      await state.save()
    } catch (stateErr) {
      console.warn('持久化揭晓状态失败:', stateErr.message)
    }

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

// ===== POST /api/performance/reveal-vote-digit - 逐位揭晓队伍票数（百/十/个）=====
router.post('/reveal-vote-digit', auth, requireAdmin, async (req, res) => {
  try {
    const { teamId, digit, revealed } = req.body || {}
    const round = await resolveRound(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次', code: 'NO_ROUND' })
    const map = { hundreds: 'revealHundreds', tens: 'revealTens', units: 'revealUnits' }
    const field = map[digit]
    if (!field) return res.status(400).json({ success: false, error: 'digit 必须是 hundreds/tens/units', code: 'INVALID_DIGIT' })
    const tp = await TeamPerformance.findOne({ roundId: round.id, teamId })
    if (!tp) return res.status(404).json({ success: false, error: '队伍不存在', code: 'TEAM_NOT_FOUND' })
    tp[field] = revealed !== false
    tp.updatedAt = new Date().toISOString()
    await tp.save()
    res.json({ success: true, data: { teamId, digit, revealed: tp[field] } })
  } catch (e) {
    console.error('Reveal vote digit error:', e)
    res.status(500).json({ success: false, error: '揭晓票数失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/performance/revealed-teams - 获取已揭晓的队伍列表 =====
router.get('/revealed-teams', auth, async (req, res) => {
  try {
    const round = await resolveRoundFromQuery(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次（请传 roundId 或 round）', code: 'NO_ROUND' })

    // 已结算的队伍（TeamPerformance 有记录）
    const teamPerfs = await TeamPerformance.find({ roundId: round.id })
    const calcRevealedIds = teamPerfs.map(tp => tp.teamId)

    // 从持久化状态获取已揭晓队伍（管理员逐个点击揭晓，逐步展示）
    const state = await PerformanceRoundState.findOne({ roundId: round.id })
    const savedRevealedIds = state && Array.isArray(state.revealedTeamIds) ? state.revealedTeamIds : []

    // 仅返回管理员已揭晓的队伍（不把所有已结算团队视为已揭晓）
    const revealedTeamIds = [...new Set(savedRevealedIds)]
    const frontRoundId = `round-${round.index || 1}`
    const teams = await RoundTeam.find({ roundId: { $in: [round.id, frontRoundId] } })

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