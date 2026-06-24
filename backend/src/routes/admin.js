const express = require('express')
const router = express.Router()
const { auth, requireAdmin } = require('../middleware/auth')
const {
  generateId, logAction, getCurrentSeason,
  STAGE_ORDER, STAGE_NAME, getStageStatus, getStageName, getNextStage,
  ACTION_TYPES, randomInt
} = require('../utils/helpers')
const Season = require('../models/Season')
const Round = require('../models/Round')
const RoundTeam = require('../models/RoundTeam')
const RoundTeamMember = require('../models/RoundTeamMember')
const Song = require('../models/Song')
const RoundSong = require('../models/RoundSong')
const TeamSong = require('../models/TeamSong')
const User = require('../models/User')
const TrainingRecord = require('../models/TrainingRecord')
const TrainingCard = require('../models/TrainingCard')
const RehearsalResult = require('../models/RehearsalResult')
const TeamPerformance = require('../models/TeamPerformance')
const PlayerPerformance = require('../models/PlayerPerformance')
const Elimination = require('../models/Elimination')
const RoundCaptain = require('../models/RoundCaptain')

// ===== 辅助函数 =====

async function ensureSeason() {
  let season = await getCurrentSeason()
  if (!season) {
    season = new Season({
      id: generateId(),
      name: '乘风2026',
      currentRound: 1,
      currentStage: 'preparation',
      totalRounds: 3,
      status: 'running'
    })
    await season.save()
  }
  return season
}

async function getOrCreateRound(season, roundIndex) {
  let round = await Round.findOne({ seasonId: season.id, index: roundIndex })
  if (!round) {
    round = new Round({
      id: generateId(),
      seasonId: season.id,
      index: roundIndex,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    await round.save()
  }
  return round
}

// ================================================================
// 阶段控制
// ================================================================

// POST /api/admin/progress/set
router.post('/progress/set', auth, requireAdmin, async (req, res) => {
  try {
    const { round, stage } = req.body
    if (typeof round !== 'number' || round < 1) {
      return res.status(400).json({ success: false, error: 'round 必须为 >= 1 的整数', code: 'INVALID_ROUND' })
    }
    if (!STAGE_ORDER.includes(stage)) {
      return res.status(400).json({ success: false, error: `无效的 stage，可选值: ${STAGE_ORDER.join(', ')}`, code: 'INVALID_STAGE' })
    }
    const season = await ensureSeason()
    const prevRound = season.currentRound
    const prevStage = season.currentStage
    season.currentRound = round
    season.currentStage = stage
    season.updatedAt = new Date().toISOString()
    await season.save()
    await logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.PROGRESS_SET, 'season', season.id,
      `进度设置: ${prevRound}公 ${getStageName(prevStage)} → ${round}公 ${getStageName(stage)}`)
    res.json({ success: true, data: { currentRound: season.currentRound, currentStage: season.currentStage, currentStageName: getStageName(season.currentStage) } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置进度失败', code: 'SERVER_ERROR' })
  }
})

// POST /api/admin/progress/next
router.post('/progress/next', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()
    const nextStage = getNextStage(season.currentStage)
    const prevRound = season.currentRound
    const prevStage = season.currentStage
    if (nextStage === null) {
      const newRound = season.currentRound + 1
      if (newRound > season.totalRounds) {
        return res.status(400).json({ success: false, error: '已经是最后一轮，无法继续推进', code: 'NO_MORE_ROUNDS' })
      }
      season.currentRound = newRound
      season.currentStage = 'preparation'
    } else {
      season.currentStage = nextStage
    }
    season.updatedAt = new Date().toISOString()
    await season.save()
    const desc = nextStage === null ? `淘汰 → 进入第${season.currentRound}公 预先准备` : `${getStageName(prevStage)} → ${getStageName(nextStage)}`
    await logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.PROGRESS_NEXT, 'season', season.id, `自动推进: ${desc}`)
    res.json({
      success: true,
      data: {
        previousRound: prevRound,
        previousStage: prevStage,
        currentRound: season.currentRound,
        currentStage: season.currentStage,
        currentStageName: getStageName(season.currentStage)
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '推进失败', code: 'SERVER_ERROR' })
  }
})

// GET /api/admin/progress
router.get('/progress', auth, async (req, res) => {
  try {
    const season = await ensureSeason()
    res.json({ success: true, data: { currentRound: season.currentRound, currentStage: season.currentStage, currentStageName: getStageName(season.currentStage), totalRounds: season.totalRounds } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取进度失败', code: 'SERVER_ERROR' })
  }
})

// ================================================================
// 预先准备
// ================================================================

// GET /api/admin/round/:round/preparation
router.get('/round/:round/preparation', auth, requireAdmin, async (req, res) => {
  try {
    const roundIdx = parseInt(req.params.round)
    const season = await ensureSeason()
    let round = await Round.findOne({ seasonId: season.id, index: roundIdx })
    if (!round) {
      round = new Round({
        id: generateId(),
        seasonId: season.id,
        index: roundIdx,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    }
    res.json({
      success: true,
      data: {
        round: round.index,
        teamCount: round.teamCount || 5,
        teamSizes: round.teamSizes || [],
        songPoolIds: round.songPoolIds || [],
        trainingTimesAllowed: round.trainingTimesAllowed || 5,
        eliminationCount: round.eliminationCount || 5,
        dangerLineRatio: round.dangerLineRatio || 0.2,
        teamStructures: round.teamStructures || []
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取预先准备失败', code: 'SERVER_ERROR' })
  }
})

// POST /api/admin/round/:round/preparation
router.post('/round/:round/preparation', auth, requireAdmin, async (req, res) => {
  try {
    const roundIdx = parseInt(req.params.round)
    const { teamCount, teamSizes, songPoolIds, trainingTimesAllowed, eliminationCount, dangerLineRatio, teamStructures } = req.body

    if (typeof teamCount !== 'number' || teamCount < 2 || teamCount > 20) {
      return res.status(400).json({ success: false, error: 'teamCount 必须为 2-20 之间的整数', code: 'INVALID_TEAM_COUNT' })
    }

    if (!Array.isArray(teamSizes) || teamSizes.length !== teamCount) {
      return res.status(400).json({ success: false, error: 'teamSizes 数组长度必须等于 teamCount', code: 'INVALID_TEAM_SIZES_LENGTH' })
    }

    for (let i = 0; i < teamSizes.length; i++) {
      if (typeof teamSizes[i] !== 'number' || teamSizes[i] < 1 || teamSizes[i] > 20) {
        return res.status(400).json({ success: false, error: `teamSizes[${i}] 必须为 1-20 之间的整数`, code: 'INVALID_TEAM_SIZE' })
      }
    }

    if (!Array.isArray(songPoolIds)) {
      return res.status(400).json({ success: false, error: 'songPoolIds 必须为数组', code: 'INVALID_SONG_POOL' })
    }

    if (typeof trainingTimesAllowed !== 'number' || trainingTimesAllowed < 0 || trainingTimesAllowed > 20) {
      return res.status(400).json({ success: false, error: 'trainingTimesAllowed 必须为 0-20 之间的整数', code: 'INVALID_TRAINING_TIMES' })
    }

    if (eliminationCount !== undefined && (typeof eliminationCount !== 'number' || eliminationCount < 0)) {
      return res.status(400).json({ success: false, error: 'eliminationCount 必须为非负整数', code: 'INVALID_ELIMINATION_COUNT' })
    }

    if (dangerLineRatio !== undefined && (typeof dangerLineRatio !== 'number' || dangerLineRatio < 0 || dangerLineRatio > 1)) {
      return res.status(400).json({ success: false, error: 'dangerLineRatio 必须为 0-1 之间的小数', code: 'INVALID_DANGER_LINE_RATIO' })
    }

    const season = await ensureSeason()
    let round = await Round.findOne({ seasonId: season.id, index: roundIdx })
    if (!round) {
      round = new Round({
        id: generateId(),
        seasonId: season.id,
        index: roundIdx,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    }

    round.teamCount = teamCount
    round.teamSizes = teamSizes
    round.songPoolIds = songPoolIds
    round.trainingTimesAllowed = trainingTimesAllowed
    round.eliminationCount = eliminationCount !== undefined ? eliminationCount : 5
    round.dangerLineRatio = dangerLineRatio !== undefined ? dangerLineRatio : 0.2
    round.teamStructures = Array.isArray(teamStructures) ? teamStructures : []
    round.updatedAt = new Date().toISOString()

    await round.save()

    res.json({
      success: true,
      message: '保存成功',
      data: {
        round: round.index,
        saved: true,
        teamCount: round.teamCount,
        teamSizes: round.teamSizes,
        songPoolIds: round.songPoolIds,
        trainingTimesAllowed: round.trainingTimesAllowed,
        eliminationCount: round.eliminationCount,
        dangerLineRatio: round.dangerLineRatio
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '保存预先准备失败', code: 'SERVER_ERROR' })
  }
})

// ================================================================
// 队长管理
// ================================================================

// GET /api/admin/round/:round/captains
router.get('/round/:round/captains', auth, requireAdmin, async (req, res) => {
  try {
    const roundIdx = parseInt(req.params.round)
    const season = await ensureSeason()
    const round = await Round.findOne({ seasonId: season.id, index: roundIdx })
    if (!round) return res.json({ success: true, data: [] })
    const captains = await RoundCaptain.find({ roundId: round.id })
    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u
    const data = captains.map(c => ({
      playerId: c.playerId,
      playerName: userMap[c.playerId]?.name || null,
      teamId: c.teamId || null,
      assignedBy: c.assignedBy || 'admin'
    }))
    res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取队长失败', code: 'SERVER_ERROR' })
  }
})

// POST /api/admin/round/:round/captains
router.post('/round/:round/captains', auth, requireAdmin, async (req, res) => {
  try {
    const roundIdx = parseInt(req.params.round)
    const { playerId, teamId } = req.body
    if (!playerId) return res.status(400).json({ success: false, error: '缺少 playerId', code: 'MISSING_PARAM' })
    const season = await ensureSeason()
    const round = await getOrCreateRound(season, roundIdx)
    // 删除旧记录
    await RoundCaptain.deleteMany({ roundId: round.id, playerId })
    // 写入新记录
    const captain = new RoundCaptain({
      id: generateId(),
      roundId: round.id,
      roundIndex: roundIdx,
      playerId,
      teamId: teamId || null,
      assignedBy: 'admin',
      createdAt: new Date().toISOString()
    })
    await captain.save()
    // 更新选手角色
    const user = await User.findOne({ id: playerId })
    if (user) {
      user.role = 'captain'
      await user.save()
    }
    await logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.CAPTAIN_ASSIGN, 'roundCaptain', captain.id, `指定 ${user?.name} 为第${roundIdx}公队长`)
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '指定队长失败', code: 'SERVER_ERROR' })
  }
})

// ================================================================
// 队伍管理（手动分配 / 随机分配）
// ================================================================

// POST /api/admin/team/assign
router.post('/team/assign', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, assignments } = req.body
    if (!roundId || !Array.isArray(assignments)) {
      return res.status(400).json({ success: false, error: '缺少 roundId 或 assignments', code: 'MISSING_PARAM' })
    }
    // 检查是否有已锁定的队伍
    const teams = await RoundTeam.find({ roundId })
    const teamMap = {}
    for (const t of teams) teamMap[t.id] = t
    for (const a of assignments) {
      const t = teamMap[a.teamId]
      if (t && t.locked) return res.status(403).json({ success: false, error: `队伍"${t.name}"已锁定，无法修改成员`, code: 'TEAM_LOCKED' })
    }
    // 先删除该轮所有旧成员
    await RoundTeamMember.deleteMany({ roundId })
    // 写入新分配
    for (const a of assignments) {
      for (const pid of (a.playerIds || [])) {
        const m = new RoundTeamMember({
          id: generateId(),
          roundId,
          teamId: a.teamId,
          playerId: pid,
          createdAt: new Date().toISOString()
        })
        await m.save()
      }
    }
    await logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TEAM_MANUAL_ASSIGN, 'roundTeamMember', roundId, `手动分配 ${assignments.length} 队`)

    // 返回更新后的队伍列表
    const updatedTeams = await RoundTeam.find({ roundId })
    const updatedMembers = await RoundTeamMember.find({ roundId })
    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    const membersByTeam = {}
    for (const m of updatedMembers) {
      if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = []
      if (userMap[m.playerId]) membersByTeam[m.teamId].push(userMap[m.playerId])
    }

    const teamsData = updatedTeams.map(t => ({
      id: t.id, roundId: t.roundId, roundIndex: t.roundIndex,
      name: t.name, index: t.index, maxMembers: t.maxMembers, captainId: t.captainId,
      captainName: t.captainId && userMap[t.captainId] ? userMap[t.captainId].name : null,
      memberIds: (membersByTeam[t.id] || []).map(u => u.id),
      members: (membersByTeam[t.id] || []).map(u => ({
        playerId: u.id,
        player: { id: u.id, name: u.name, avatar: u.avatar || null, role: u.role || 'player', status: u.status || 'active', attributes: u.attributes || { vocal: 0, dance: 0, charm: 0 }, trainingCount: typeof u.trainingCount === 'number' ? u.trainingCount : 0 }
      })),
      memberCount: (membersByTeam[t.id] || []).length,
      createdAt: t.createdAt
    }))

    res.json({ success: true, data: teamsData })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '手动分配失败', code: 'SERVER_ERROR' })
  }
})

// POST /api/admin/team/random
router.post('/team/random', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId } = req.body
    if (!roundId) return res.status(400).json({ success: false, error: '缺少 roundId', code: 'MISSING_PARAM' })
    const teams = await RoundTeam.find({ roundId })
    // 检查是否有已锁定的队伍
    const lockedTeams = teams.filter(t => t.locked)
    if (lockedTeams.length > 0) {
      return res.status(403).json({ success: false, error: `队伍"${lockedTeams[0].name}"已锁定，无法修改成员，共 ${lockedTeams.length} 队已锁定`, code: 'TEAM_LOCKED' })
    }
    const members = await RoundTeamMember.find({ roundId })
    const memberIds = members.map(m => m.playerId)
    // 已入队的选手
    const assigned = new Set(memberIds)
    // 未入队的选手（排除管理员和已淘汰的）
    const users = await User.find({})
    const unassigned = users.filter(u => {
      if (u.role === 'admin') return false
      if (u.status === 'eliminated') return false
      if (assigned.has(u.id)) return false
      return true
    })
    // 已有队长的队伍保留队长
    const captainInTeam = new Set()
    for (const m of members) {
      const u = users.find(u => u.id === m.playerId)
      if (u?.role === 'captain') captainInTeam.add(m.teamId)
    }
    // 剩余空位
    const slotMap = {}
    for (const t of teams) {
      const teamMemberCount = members.filter(m => m.teamId === t.id).length
      slotMap[t.id] = Math.max(0, t.maxMembers - teamMemberCount)
    }
    // 随机分配未入队选手到有空位的队伍
    let assignedCount = 0
    const shuffled = [...unassigned].sort(() => Math.random() - 0.5)
    for (const pid of shuffled) {
      // 找有空位的队伍（优先不包含已有队长的队伍）
      let targetTeamId = null
      for (const t of teams) {
        if (slotMap[t.id] > 0 && !captainInTeam.has(t.id)) {
          targetTeamId = t.id
          break
        }
      }
      if (!targetTeamId) {
        for (const t of teams) {
          if (slotMap[t.id] > 0) {
            targetTeamId = t.id
            break
          }
        }
      }
      if (!targetTeamId) break
      const m = new RoundTeamMember({
        id: generateId(),
        roundId,
        teamId: targetTeamId,
        playerId: pid,
        createdAt: new Date().toISOString()
      })
      await m.save()
      slotMap[targetTeamId]--
      assignedCount++
    }
    // 返回更新后的队伍
    const updatedTeams = await RoundTeam.find({ roundId })
    const updatedMembers = await RoundTeamMember.find({ roundId })
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    const membersByTeam = {}
    for (const m of updatedMembers) {
      if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = []
      if (userMap[m.playerId]) membersByTeam[m.teamId].push(userMap[m.playerId])
    }

    const teamsData = updatedTeams.map(t => ({
      id: t.id, roundId: t.roundId, roundIndex: t.roundIndex,
      name: t.name, index: t.index, maxMembers: t.maxMembers, captainId: t.captainId,
      captainName: t.captainId && userMap[t.captainId] ? userMap[t.captainId].name : null,
      memberIds: (membersByTeam[t.id] || []).map(u => u.id),
      members: (membersByTeam[t.id] || []).map(u => ({
        playerId: u.id,
        player: { id: u.id, name: u.name, avatar: u.avatar || null, role: u.role || 'player', status: u.status || 'active', attributes: u.attributes || { vocal: 0, dance: 0, charm: 0 }, trainingCount: typeof u.trainingCount === 'number' ? u.trainingCount : 0 }
      })),
      memberCount: (membersByTeam[t.id] || []).length,
      createdAt: t.createdAt
    }))
    await logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TEAM_RANDOM_ASSIGN, 'roundTeamMember', roundId, `随机分配 ${assignedCount} 位选手`)
    res.json({ success: true, data: { assignedCount, teams: teamsData } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '随机分配失败', code: 'SERVER_ERROR' })
  }
})

// ================================================================
// 选歌管理
// ================================================================

// POST /api/admin/song/release
router.post('/song/release', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, songIds, songType = 'team_show' } = req.body
    if (!roundId || !Array.isArray(songIds)) {
      return res.status(400).json({ success: false, error: '缺少 roundId 或 songIds', code: 'MISSING_PARAM' })
    }
    for (const sid of songIds) {
      const existing = await RoundSong.findOne({ roundId, songId: sid })
      if (existing) continue
      const rs = new RoundSong({
        id: generateId(),
        roundId,
        songId: sid,
        songType,
        released: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      await rs.save()
    }
    await logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.ROUND_SONG_ADD, 'roundSong', roundId, `释放 ${songIds.length} 首歌曲到轮次`)
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '释放歌曲失败', code: 'SERVER_ERROR' })
  }
})

// POST /api/admin/song/assign
router.post('/song/assign', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, assignments } = req.body
    if (!roundId || !Array.isArray(assignments)) {
      return res.status(400).json({ success: false, error: '缺少 roundId 或 assignments', code: 'MISSING_PARAM' })
    }
    // 删除旧分配
    const old = await TeamSong.find({ roundId })
    for (const ts of old) {
      await TeamSong.deleteOne({ id: ts.id })
    }
    // 写入新分配
    for (const a of assignments) {
      const ts = new TeamSong({
        id: generateId(),
        roundId,
        teamId: a.teamId,
        songId: a.songId,
        assignedBy: 'manual',
        createdAt: new Date().toISOString()
      })
      await ts.save()
    }
    await logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TEAM_SONG_ASSIGN, 'teamSong', roundId, `分配 ${assignments.length} 首歌曲`)
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '分配歌曲失败', code: 'SERVER_ERROR' })
  }
})

// ================================================================
// 训练统计
// ================================================================

// GET /api/admin/training/statistics
router.get('/training/statistics', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: '缺少 roundId', code: 'MISSING_PARAM' })
    const season = await ensureSeason()
    const records = await TrainingRecord.find({ roundId })
    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u
    const playerStats = []
    const counted = new Set()
    for (const r of records) {
      if (counted.has(r.playerId)) continue
      counted.add(r.playerId)
      const u = userMap[r.playerId]
      const drawCount = records.filter(x => x.playerId === r.playerId).length
      playerStats.push({
        playerId: r.playerId,
        playerName: u?.name || null,
        drawCount,
        remainingDraws: Math.max(0, (season.trainingDrawsPerPlayer || 3) - drawCount),
        totalRecords: drawCount
      })
    }
    res.json({ success: true, data: { totalDraws: records.length, playerStats } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取训练统计失败', code: 'SERVER_ERROR' })
  }
})

// ================================================================
// 彩排生成
// ================================================================

// POST /api/admin/rehearsal/generate
router.post('/rehearsal/generate', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, teamId, all = false } = req.body
    if (!roundId) return res.status(400).json({ success: false, error: '缺少 roundId', code: 'MISSING_PARAM' })
    const teams = all || teamId
      ? await RoundTeam.find({ roundId })
      : await RoundTeam.find({ roundId, id: teamId })
    const results = []
    for (const t of teams) {
      const eventId = `evt_${randomInt(1, 100)}`
      const teamBonus = randomInt(5, 20)
      const eachBonus = randomInt(2, 8)
      const rr = new RehearsalResult({
        id: generateId(),
        roundId,
        teamId: t.id,
        teamName: t.name,
        eventId,
        eventName: '彩排顺利',
        bonus: { team: teamBonus, each: eachBonus },
        finalScore: teamBonus + eachBonus,
        createdAt: new Date().toISOString()
      })
      await rr.save()
      results.push(rr)
    }
    await logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.REHEARSAL_ROLL, 'rehearsalResult', roundId, `生成 ${results.length} 队彩排结果`)
    res.json({ success: true, data: results.map(r => r.toObject ? r.toObject() : r) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '生成彩排失败', code: 'SERVER_ERROR' })
  }
})

// ================================================================
// 公演结算
// ================================================================

// POST /api/admin/performance/calculate
router.post('/performance/calculate', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId: inputRoundId } = req.body
    if (!inputRoundId) return res.status(400).json({ success: false, error: '缺少 roundId', code: 'MISSING_PARAM' })
    // 兼容 round-1 / round_1 格式
    let round = await Round.findOne({ id: inputRoundId })
    if (!round) {
      const match = inputRoundId.match(/^round[_-](\d+)$/)
      if (match) {
        const idx = parseInt(match[1])
        const season = await ensureSeason()
        round = await getOrCreateRound(season, idx)
      }
    }
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'NO_ROUND' })
    // 使用实际 Round.id 作为数据库查询的 roundId，前端传入的 roundId 用于 RoundTeam 等查询
    const dbRoundId = round.id
    const frontRoundId = inputRoundId
    const season = await ensureSeason()
    const BASE_VOTES = 500

    // 队伍（用前端 roundId 查询，因为 teams 的 roundId 存的是前端格式如 "round-1"）
    const teams = await RoundTeam.find({ roundId: frontRoundId })
    if (teams.length === 0) return res.status(400).json({ success: false, error: '该轮没有队伍', code: 'NO_TEAMS' })

    // 歌曲
    const teamSongs = await TeamSong.find({ roundId: frontRoundId })
    const allSongs = await Song.find({})
    const songMap = {}
    for (const s of allSongs) songMap[s.id] = s
    const teamSongMap = {}
    for (const ts of teamSongs) teamSongMap[ts.teamId] = ts

    // 成员
    const members = await RoundTeamMember.find({ roundId: frontRoundId })
    const membersByTeam = {}
    for (const m of members) { if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = []; membersByTeam[m.teamId].push(m) }

    // 选手
    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    // 彩排
    const rehearsalResults = await RehearsalResult.find({ roundId: frontRoundId })
    const teamRehearsal = {}
    for (const r of rehearsalResults) { if (!teamRehearsal[r.teamId] || new Date(r.createdAt) > new Date(teamRehearsal[r.teamId].createdAt)) teamRehearsal[r.teamId] = r }

    // 舞台事件池
    const StageEvent = require('../models/StageEvent')
    const stageEvents = await StageEvent.find({ enabled: true })

    // 清空旧结果（同时清理用前端 roundId 和 dbRoundId 存的旧数据）
    await TeamPerformance.deleteMany({ roundId: { $in: [dbRoundId, frontRoundId] } })
    await PlayerPerformance.deleteMany({ roundId: { $in: [dbRoundId, frontRoundId] } })

    const teamResults = []
    const allPlayerResults = []

    for (const team of teams) {
      const ts = teamSongMap[team.id]
      const song = ts ? songMap[ts.songId] : null
      const teamMembers = (membersByTeam[team.id] || []).filter(m => {
        const u = userMap[m.playerId]
        return u && u.status !== 'eliminated'
      })
      if (teamMembers.length === 0) continue

      const vw = song?.vocalWeight || 3
      const dw = song?.danceWeight || 3
      const cw = song?.charmWeight || 3

      let sumVocal = 0, sumDance = 0, sumCharm = 0
      for (const m of teamMembers) {
        const u = userMap[m.playerId]
        sumVocal += u.attributes?.vocal || 0
        sumDance += u.attributes?.dance || 0
        sumCharm += u.attributes?.charm || 0
      }
      const n = teamMembers.length
      const avgVocal = Math.round(sumVocal / n)
      const avgDance = Math.round(sumDance / n)
      const avgCharm = Math.round(sumCharm / n)

      const attrWeighted = (avgVocal * vw + avgDance * dw + avgCharm * cw) / (vw + dw + cw)
      const attributeVotes = Math.round(attrWeighted * 0.8)

      const songIdeal = (50 * vw + 50 * dw + 50 * cw) / (vw + dw + cw)
      const deviation = Math.abs(attrWeighted - songIdeal)
      const compatibilityScore = Math.max(0, Math.round(100 - deviation * 2))
      const compatibilityVotes = Math.round(compatibilityScore * 0.63)

      const memberPerformances = []
      let totalPerformance = 0
      for (const m of teamMembers) {
        const u = userMap[m.playerId]
        const perfValue = randomInt(-10, 20)
        totalPerformance += perfValue
        memberPerformances.push({ playerId: u.id, playerName: u.name, performanceValue: perfValue })
      }
      const performanceVotes = totalPerformance

      let eventVotes = 0, eventId = null, eventName = '', eventDescription = ''
      if (stageEvents.length > 0) {
        const drawn = stageEvents[Math.floor(Math.random() * stageEvents.length)]
        eventVotes = drawn.voteEffect || 0
        eventId = drawn.id
        eventName = drawn.name
        eventDescription = drawn.description || ''
      }

      const rehearsalBonus = teamRehearsal[team.id]?.bonus?.team || 0
      const finalVotes = Math.max(0, BASE_VOTES + attributeVotes + performanceVotes + compatibilityVotes + eventVotes + rehearsalBonus)

      teamResults.push({
        teamId: team.id, teamName: team.name, songId: song?.id || null, songName: song?.name || null,
        baseVotes: BASE_VOTES, attributeVotes, performanceVotes, compatibilityVotes, eventVotes,
        finalVotes, rehearsalBonus,
        songVocalWeight: vw, songDanceWeight: dw, songCharmWeight: cw,
        avgVocal, avgDance, avgCharm, compatibilityScore,
        eventId, eventName, eventDescription,
        memberPerformances
      })

      const teamPlayerResults = []
      for (const mp of memberPerformances) {
        teamPlayerResults.push({
          playerId: mp.playerId, playerName: mp.playerName, teamId: team.id, teamName: team.name,
          performanceValue: mp.performanceValue, contribution: 0, rankInTeam: null
        })
      }
      const absTotal = teamPlayerResults.reduce((s, p) => s + Math.abs(p.performanceValue), 0) || 1
      for (const p of teamPlayerResults) p.contribution = Math.round((Math.abs(p.performanceValue) / absTotal) * 100)
      teamPlayerResults.sort((a, b) => b.performanceValue - a.performanceValue)
      for (let i = 0; i < teamPlayerResults.length; i++) teamPlayerResults[i].rankInTeam = i + 1
      allPlayerResults.push(...teamPlayerResults)
    }

    teamResults.sort((a, b) => b.finalVotes - a.finalVotes)
    for (let i = 0; i < teamResults.length; i++) teamResults[i].rank = i + 1

    allPlayerResults.sort((a, b) => b.performanceValue - a.performanceValue)
    for (let i = 0; i < allPlayerResults.length; i++) allPlayerResults[i].rank = i + 1

    const savedTeamPerf = []
    for (const tr of teamResults) {
      const tp = new TeamPerformance({
        id: generateId(), roundId: dbRoundId, roundIndex: round.index, teamId: tr.teamId, songId: tr.songId,
        teamName: tr.teamName, songName: tr.songName,
        baseVotes: tr.baseVotes, attributeVotes: tr.attributeVotes,
        performanceVotes: tr.performanceVotes, compatibilityVotes: tr.compatibilityVotes,
        eventVotes: tr.eventVotes, finalVotes: tr.finalVotes,
        finalScore: tr.finalVotes, attrScore: tr.attributeVotes + tr.compatibilityVotes,
        randomScore: tr.performanceVotes, rehearsalBonus: tr.rehearsalBonus,
        songVocalWeight: tr.songVocalWeight, songDanceWeight: tr.songDanceWeight, songCharmWeight: tr.songCharmWeight,
        avgVocal: tr.avgVocal, avgDance: tr.avgDance, avgCharm: tr.avgCharm,
        compatibilityScore: tr.compatibilityScore,
        eventId: tr.eventId, eventName: tr.eventName, eventDescription: tr.eventDescription,
        memberPerformances: tr.memberPerformances,
        rank: tr.rank, createdAt: new Date().toISOString()
      })
      await tp.save()
      savedTeamPerf.push(tp)
    }

    const savedPlayerPerf = []
    for (const pr of allPlayerResults) {
      const pp = new PlayerPerformance({
        id: generateId(), roundId: dbRoundId, roundIndex: round.index,
        playerId: pr.playerId, teamId: pr.teamId, playerName: pr.playerName, teamName: pr.teamName,
        performanceValue: pr.performanceValue, contribution: pr.contribution,
        rankInTeam: pr.rankInTeam, rank: pr.rank, createdAt: new Date().toISOString()
      })
      await pp.save()
      savedPlayerPerf.push(pp)
    }

    await logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.PERFORMANCE_CALC, 'performance', dbRoundId, `第 ${round.index} 轮公演结算: ${savedTeamPerf.length} 团 / ${savedPlayerPerf.length} 人`)

    res.json({
      success: true,
      data: {
        teamPerformances: savedTeamPerf.map(t => { const o = t.toObject ? t.toObject() : t; delete o._id; return o }),
        playerPerformances: savedPlayerPerf.map(p => { const o = p.toObject ? p.toObject() : p; delete o._id; return o })
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '公演结算失败', code: 'SERVER_ERROR' })
  }
})

// ================================================================
// 淘汰确认
// ================================================================

// POST /api/admin/elimination/confirm
router.post('/elimination/confirm', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, playerIds, reason = '公演淘汰' } = req.body
    if (!roundId || !Array.isArray(playerIds) || playerIds.length === 0) {
      return res.status(400).json({ success: false, error: '缺少 roundId 或 playerIds', code: 'MISSING_PARAM' })
    }
    const round = await Round.findOne({ id: roundId })
    const teamPerf = await TeamPerformance.find({ roundId })
    const playerPerf = await PlayerPerformance.find({ roundId })
    const members = await RoundTeamMember.find({ roundId })
    const teams = await RoundTeam.find({ roundId })
    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u
    const teamMap = {}
    for (const t of teams) teamMap[t.id] = t
    const perPlayer = new Map()
    for (const pp of playerPerf) perPlayer.set(pp.playerId, pp)
    const playerToTeam = new Map()
    for (const m of members) playerToTeam.set(m.playerId, m.teamId)
    const eliminatedList = []
    for (const pid of playerIds) {
      const u = userMap[pid]
      if (!u) continue
      u.status = 'eliminated'
      await u.save()
      const pp = perPlayer.get(pid)
      const teamId = playerToTeam.get(pid) || null
      const elim = new Elimination({
        id: generateId(),
        roundId,
        roundIndex: round?.index || 1,
        playerId: pid,
        userName: u.name,
        teamId,
        teamName: teamId ? teamMap[teamId]?.name || null : null,
        finalScore: pp?.finalScore ?? null,
        rank: pp?.rank ?? null,
        reason,
        eliminated: true,
        eliminatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      })
      await elim.save()
      eliminatedList.push(elim)
    }
    await logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.ELIMINATION, 'elimination', roundId, `第${round?.index || 1}公淘汰 ${eliminatedList.length} 位选手`)
    res.json({ success: true, data: { eliminatedCount: eliminatedList.length, eliminatedList } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '淘汰失败', code: 'SERVER_ERROR' })
  }
})

// ================================================================
// 淘汰复活
// ================================================================

// POST /api/admin/elimination/restore/:playerId
router.post('/elimination/restore/:playerId', auth, requireAdmin, async (req, res) => {
  try {
    const { playerId } = req.params
    const user = await User.findOne({ id: playerId })
    if (!user) return res.status(404).json({ success: false, error: '用户不存在', code: 'NOT_FOUND' })
    user.status = 'active'
    await user.save()
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '恢复失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
