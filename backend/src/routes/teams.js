const express = require('express')
const { auth, requireAdmin } = require('../middleware/auth')
const { generateId, logAction, maskPlayer, getCurrentSeason, ACTION_TYPES } = require('../utils/helpers')
const RoundTeam = require('../models/RoundTeam')
const RoundTeamMember = require('../models/RoundTeamMember')
const RoundCaptain = require('../models/RoundCaptain')
const User = require('../models/User')
const Round = require('../models/Round')
const TeamInvite = require('../models/TeamInvite')
const TeamApplication = require('../models/TeamApplication')
const Song = require('../models/Song')
const RoundSong = require('../models/RoundSong')

const router = express.Router()

// ===== 工具: 获取指定 roundId 对应的 Round（兼容 round-1 / round_1 / 纯数字 / roundIndex 字段错误） =====
async function getRound(roundId) {
  if (roundId) {
    const r = await Round.findOne({ id: roundId })
    if (r) return r
    // 尝试匹配 "round-1" 或 "round_1" 格式
    const match = roundId.match(/^round[_-](\d+)$/)
    let idx = match ? parseInt(match[1]) : null
    // 如果正则不匹配，尝试解析为纯数字（如 "1"）
    if (idx === null) {
      const num = parseInt(roundId)
      if (!isNaN(num) && num > 0) idx = num
    }
    if (idx !== null) {
      const season = await getCurrentSeason()
      if (season) {
        let r2 = await Round.findOne({ seasonId: season.id, index: idx })
        if (r2) return r2
        // 兼容 seed 数据中 roundIndex 字段名错误的情况
        r2 = await Round.findOne({ seasonId: season.id, roundIndex: idx })
        if (r2) { r2.index = idx; await r2.save(); return r2 }
        return { id: `round-${idx}`, index: idx }
      }
    }
    return null
  }
  const season = await getCurrentSeason()
  if (!season) return null
  let r = await Round.findOne({ seasonId: season.id, index: season.currentRound })
  if (!r) r = await Round.findOne({ seasonId: season.id, roundIndex: season.currentRound })
  return r
}

// ===== 工具: 格式化成员为前端期望格式 { playerId, player: { id, name, avatar, role, status, attributes, trainingCount } } =====
function formatMember(user) {
  if (!user) return null
  return {
    playerId: user.id,
    player: {
      id: user.id,
      name: user.name,
      avatar: user.avatar || null,
      role: user.role || 'player',
      status: user.status || 'active',
      attributes: user.attributes || { vocal: 0, dance: 0, charm: 0 },
      trainingCount: typeof user.trainingCount === 'number' ? user.trainingCount : 0
    }
  }
}

// ===== GET /api/teams - 按轮次列出队伍（roundId 必填）=====
router.get('/', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id

    const filter = roundId !== rId ? { $or: [{ roundId: rId }, { roundId: roundId }] } : { roundId: rId }

    let teams = await RoundTeam.find(filter)
    teams = teams.sort((a, b) => (a.index || 0) - (b.index || 0))

    // 同时查成员
    const members = await RoundTeamMember.find(filter)
    const userMap = {}
    const users = await User.find({})
    for (const u of users) userMap[u.id] = u

    const membersByTeam = {}
    for (const m of members) {
      if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = []
      if (userMap[m.playerId]) membersByTeam[m.teamId].push(userMap[m.playerId])
    }

    const enriched = teams.map(t => ({
      id: t.id,
      roundId: t.roundId,
      roundIndex: t.roundIndex,
      name: t.name,
      index: t.index,
      maxMembers: t.maxMembers,
      captainId: t.captainId,
      captainName: t.captainId && userMap[t.captainId] ? userMap[t.captainId].name : null,
      locked: t.locked || false,
      createdAt: t.createdAt,
      memberIds: (membersByTeam[t.id] || []).map(u => u.id),
      members: (membersByTeam[t.id] || []).map(formatMember),
      memberCount: (membersByTeam[t.id] || []).length
    }))

    res.json({ success: true, data: enriched, total: enriched.length })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取队伍列表失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/teams/stats/summary（roundId 必填）=====
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id

    const filter = roundId !== rId ? { $or: [{ roundId: rId }, { roundId: roundId }] } : { roundId: rId }

    const [teams, members] = await Promise.all([
      RoundTeam.find(filter),
      RoundTeamMember.find(filter)
    ])
    const countMap = {}
    for (const m of members) {
      countMap[m.teamId] = (countMap[m.teamId] || 0) + 1
    }

    const stats = teams.map(t => ({
      id: t.id,
      name: t.name,
      index: t.index,
      maxMembers: t.maxMembers,
      memberCount: countMap[t.id] || 0,
      roundIndex: t.roundIndex,
      captainId: t.captainId
    }))
    res.json({ success: true, data: stats, total: teams.length, unassigned: 0 })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取统计失败', code: 'SERVER_ERROR' })
  }
})

// ===== 共享: 创建/更新轮次队伍配置 =====
async function setupTeams(req, res) {
  try {
    const { roundId, teamCount, teamSizes, teamNames, groupingMode } = req.body
    if (!teamCount || !Array.isArray(teamSizes)) {
      return res.status(400).json({ success: false, error: 'teamCount 和 teamSizes 必填', code: 'INVALID_PARAMS' })
    }

    const round = await getRound(roundId)
    const rId = round ? round.id : (roundId || 'default-round')
    const rIdx = round ? round.index : null

    // 保存分组模式到 Round（如传入）
    if (round && ['captain', 'song', 'captain_choice'].includes(groupingMode)) {
      round.groupingMode = groupingMode
      round.updatedAt = new Date().toISOString()
      await round.save()
    }

    // 兼容两种 roundId 格式：UUID 或前端格式（如 "round-1"）
    // 同时删除两种格式下的旧数据，避免重复
    await RoundTeam.deleteMany({ roundId: { $in: [rId, roundId].filter(Boolean) } })
    await RoundTeamMember.deleteMany({ roundId: { $in: [rId, roundId].filter(Boolean) } })
    // 按歌分组模式下选歌后可能遗留的申请/意向也清理
    await TeamApplication.deleteMany({ roundId: { $in: [rId, roundId].filter(Boolean) } })

    // 批量创建新队伍，id 格式: {roundId}-team-{N}
    const newTeams = []
    for (let i = 0; i < teamCount; i++) {
      const team = new RoundTeam({
        id: `${rId}-team-${i + 1}`,
        roundId: rId,
        roundIndex: rIdx,
        name: teamNames && teamNames[i] ? teamNames[i] : `第${i + 1}团`,
        index: i + 1,
        maxMembers: teamSizes[i] || 5,
        captainId: null,
        createdAt: new Date().toISOString()
      })
      await team.save()
      newTeams.push(team)
    }

    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TEAM_CHANGE, 'round', rId, `配置 ${teamCount} 支队伍`)

    res.json({
      success: true,
      data: newTeams.map(t => ({
        id: t.id,
        roundId: t.roundId,
        roundIndex: t.roundIndex,
        name: t.name,
        index: t.index,
        maxMembers: t.maxMembers,
        captainId: null,
        memberIds: [],
        members: [],
        memberCount: 0,
        createdAt: t.createdAt
      }))
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '配置队伍失败', code: 'SERVER_ERROR' })
  }
}

// ===== POST /api/teams/setup - 创建轮次队伍 =====
router.post('/setup', auth, requireAdmin, setupTeams)

// ===== PUT /api/teams/setup - 更新轮次队伍（前端使用 PUT 方法） =====
router.put('/setup', auth, requireAdmin, setupTeams)

// ===== POST /api/teams/admin/manual-assign - 手动分配成员 =====
router.post('/admin/manual-assign', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, assignments } = req.body
    if (!Array.isArray(assignments)) {
      return res.status(400).json({ success: false, error: 'assignments 必须是数组', code: 'INVALID_PARAMS' })
    }

    const round = await getRound(roundId)
    const rId = round ? round.id : (roundId || null)
    if (!rId) return res.status(400).json({ success: false, error: '未找到轮次', code: 'NO_ROUND' })

    // 兼容两种 roundId 格式：UUID 或前端格式
    let teams = await RoundTeam.find({ roundId: rId })
    if (teams.length === 0 && rId !== roundId) {
      teams = await RoundTeam.find({ roundId })
    }
    const teamIds = new Set(teams.map(t => t.id))

    // 清空该轮的成员（同时兼容两种 roundId 格式）
    await RoundTeamMember.deleteMany({ roundId: { $in: [rId, roundId].filter(Boolean) } })

    // 按 assignments 分配
    const userMap = {}
    const users = await User.find({})
    for (const u of users) userMap[u.id] = u

    const createdMembers = []
    for (const assignment of assignments) {
      if (!teamIds.has(assignment.teamId)) continue
      const team = teams.find(t => t.id === assignment.teamId)
      if (!team) continue
      const playerIds = assignment.playerIds || assignment.userIds || []
      for (const pid of playerIds.slice(0, team.maxMembers)) {
        if (!userMap[pid]) continue
        const m = new RoundTeamMember({
          id: generateId(),
          roundId: rId,
          roundIndex: round ? round.index : null,
          teamId: team.id,
          playerId: pid,
          createdAt: new Date().toISOString()
        })
        await m.save()
        createdMembers.push(m)
      }
    }

    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TEAM_MANUAL_ASSIGN, 'round', rId, `手动分配 ${createdMembers.length} 名成员`)

    // 返回更新后的队伍列表
    const updated = await RoundTeam.find({ roundId: rId })
    const membersByTeam = {}
    for (const m of createdMembers) {
      if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = []
      if (userMap[m.playerId]) membersByTeam[m.teamId].push(userMap[m.playerId])
    }

    const result = updated.map(t => ({
      id: t.id, roundId: t.roundId, roundIndex: t.roundIndex,
      name: t.name, index: t.index, maxMembers: t.maxMembers, captainId: t.captainId,
      memberIds: (membersByTeam[t.id] || []).map(u => u.id),
      members: (membersByTeam[t.id] || []).map(formatMember),
      memberCount: (membersByTeam[t.id] || []).length
    }))

    res.json({ success: true, data: result })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '手动分配失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/teams/admin/random-assign - 自动分配成员 =====
router.post('/admin/random-assign', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId } = req.body
    const round = await getRound(roundId)
    const rId = round ? round.id : (roundId || null)
    if (!rId) return res.status(400).json({ success: false, error: '未找到轮次', code: 'NO_ROUND' })

    // 兼容两种 roundId 格式：UUID（Round 文档的 id）或前端格式（如 "round-1"）
    let teams = await RoundTeam.find({ roundId: rId })
    // 如果 UUID 查不到，尝试用前端格式 roundId 再查（兼容 roundId 存为 "round-1" 格式的情况）
    if (teams.length === 0 && rId !== roundId) {
      teams = await RoundTeam.find({ roundId })
    }
    if (teams.length === 0) {
      return res.status(400).json({ success: false, error: '请先配置队伍', code: 'NO_TEAMS' })
    }
    // 确定实际使用的 roundId（优先用找到队伍时的 roundId）
    const actualRoundId = teams[0].roundId

    let existingMembers = await RoundTeamMember.find({ roundId: actualRoundId })
    // 如果实际 roundId 不同于 rId，也查一下 rId 下的成员
    if (actualRoundId !== rId) {
      const rIdMembers = await RoundTeamMember.find({ roundId: rId })
      if (rIdMembers.length > 0) existingMembers = rIdMembers
    }
    const assignedPlayerIds = new Set(existingMembers.map(m => m.playerId))

    // 所有 active 未被淘汰的选手
    const users = await User.find({})
    const players = users.filter(u => u.role !== 'admin' && u.status !== 'eliminated')

    // 未入队的选手
    const unassigned = players.filter(p => !assignedPlayerIds.has(p.id))

    // 随机打乱
    for (let i = unassigned.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[unassigned[i], unassigned[j]] = [unassigned[j], unassigned[i]]
    }

    // 每个队伍已有的成员数
    const teamCount = {}
    for (const t of teams) teamCount[t.id] = 0
    for (const m of existingMembers) {
      if (teamCount[m.teamId] !== undefined) teamCount[m.teamId]++
    }

    // 逐一向还有空位的队伍分配
    let assignedCount = 0
    for (const player of unassigned) {
      const available = teams.filter(t => (teamCount[t.id] || 0) < t.maxMembers)
      if (available.length === 0) break
      const t = available[Math.floor(Math.random() * available.length)]
      const m = new RoundTeamMember({
        id: generateId(),
        roundId: actualRoundId,
        roundIndex: round ? round.index : null,
        teamId: t.id,
        playerId: player.id,
        createdAt: new Date().toISOString()
      })
      await m.save()
      teamCount[t.id]++
      assignedCount++
    }

    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TEAM_RANDOM_ASSIGN, 'round', actualRoundId, `自动分配 ${assignedCount} 名未组队选手`)

    // 返回更新后的队伍列表
    const allMembers = await RoundTeamMember.find({ roundId: actualRoundId })
    const userMap = {}
    for (const u of users) userMap[u.id] = u
    const membersByTeam = {}
    for (const m of allMembers) {
      if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = []
      if (userMap[m.playerId]) membersByTeam[m.teamId].push(userMap[m.playerId])
    }

    const result = teams.map(t => ({
      id: t.id, roundId: t.roundId, roundIndex: t.roundIndex,
      name: t.name, index: t.index, maxMembers: t.maxMembers, captainId: t.captainId,
      memberIds: (membersByTeam[t.id] || []).map(u => u.id),
      members: (membersByTeam[t.id] || []).map(formatMember),
      memberCount: (membersByTeam[t.id] || []).length
    }))

    res.json({ success: true, data: { teams: result, assigned: assignedCount, totalUnassigned: Math.max(0, unassigned.length - assignedCount) } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '自动分配失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/teams/:teamId/captain - 设置/移除队长 =====
router.post('/:teamId/captain', auth, requireAdmin, async (req, res) => {
  try {
    const { userId, playerId } = req.body
    const targetPlayerId = playerId || userId
    const team = await RoundTeam.findOne({ id: req.params.teamId })
    if (!team) return res.status(404).json({ success: false, error: '队伍不存在', code: 'NOT_FOUND' })

    const isRemoving = !targetPlayerId
    const oldCaptainId = team.captainId
    team.captainId = isRemoving ? null : targetPlayerId
    await team.save()

    let user = null
    if (!isRemoving) {
      user = await User.findOne({ id: targetPlayerId })
      if (user && user.role !== 'admin') {
        user.role = 'captain'
        await user.save()
      }
    }

    const logMsg = isRemoving
      ? `移除队长 (原队长: ${oldCaptainId || '无'})`
      : `指定队长: ${user ? user.name : targetPlayerId}`
    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.CAPTAIN_ASSIGN, 'team', team.id, logMsg)

    res.json({ success: true, data: { id: team.id, captainId: team.captainId, captainName: user ? user.name : null } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置队长失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/teams/:teamId/members/add - 添加单个成员 =====
router.post('/:teamId/members/add', auth, requireAdmin, async (req, res) => {
  try {
    const { userId, playerId } = req.body
    const pid = playerId || userId
    const team = await RoundTeam.findOne({ id: req.params.teamId })
    if (!team) return res.status(404).json({ success: false, error: '队伍不存在', code: 'NOT_FOUND' })
    if (team.locked) return res.status(403).json({ success: false, error: '队伍已锁定，无法修改成员', code: 'TEAM_LOCKED' })

    // 是否已满
    const currentCount = (await RoundTeamMember.find({ teamId: team.id })).length
    if (currentCount >= team.maxMembers) {
      return res.status(400).json({ success: false, error: '队伍已满', code: 'TEAM_FULL' })
    }

    // 是否已在队伍中
    const existing = await RoundTeamMember.findOne({ teamId: team.id, playerId: pid })
    if (existing) return res.status(400).json({ success: false, error: '用户已在队伍中', code: 'ALREADY_IN_TEAM' })

    // 如果用户在其他队伍，先移除
    await RoundTeamMember.deleteMany({ roundId: team.roundId, playerId: pid })

    const m = new RoundTeamMember({
      id: generateId(), roundId: team.roundId, roundIndex: team.roundIndex,
      teamId: team.id, playerId: pid, createdAt: new Date().toISOString()
    })
    await m.save()

    res.json({ success: true, data: { id: team.id, playerId: pid } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '添加成员失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/teams/:teamId/members/remove - 移除单个成员 =====
router.post('/:teamId/members/remove', auth, requireAdmin, async (req, res) => {
  try {
    const { userId, playerId } = req.body
    const pid = playerId || userId
    const team = await RoundTeam.findOne({ id: req.params.teamId })
    if (!team) return res.status(404).json({ success: false, error: '队伍不存在', code: 'NOT_FOUND' })
    if (team.locked) return res.status(403).json({ success: false, error: '队伍已锁定，无法修改成员', code: 'TEAM_LOCKED' })

    await RoundTeamMember.deleteOne({ teamId: team.id, playerId: pid })

    // 如果是队长，移除队长
    if (team.captainId === pid) {
      team.captainId = null
      await team.save()
    }

    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: '移除成员失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/teams/:teamId/lock - 锁定队伍 =====
router.post('/:teamId/lock', auth, requireAdmin, async (req, res) => {
  try {
    const team = await RoundTeam.findOne({ id: req.params.teamId })
    if (!team) return res.status(404).json({ success: false, error: '队伍不存在', code: 'NOT_FOUND' })
    team.locked = true
    await team.save()
    res.json({ success: true, data: { id: team.id, locked: true } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '锁定队伍失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/teams/:teamId/unlock - 解锁队伍 =====
router.post('/:teamId/unlock', auth, requireAdmin, async (req, res) => {
  try {
    const team = await RoundTeam.findOne({ id: req.params.teamId })
    if (!team) return res.status(404).json({ success: false, error: '队伍不存在', code: 'NOT_FOUND' })
    team.locked = false
    await team.save()
    res.json({ success: true, data: { id: team.id, locked: false } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '解锁队伍失败', code: 'SERVER_ERROR' })
  }
})

// ===== PUT /api/teams/:teamId - 更新队伍信息 =====
router.put('/:teamId', auth, requireAdmin, async (req, res) => {
  try {
    const { name, maxMembers, captainId, index } = req.body
    const team = await RoundTeam.findOne({ id: req.params.teamId })
    if (!team) return res.status(404).json({ success: false, error: '队伍不存在', code: 'NOT_FOUND' })
    if (team.locked) return res.status(403).json({ success: false, error: '队伍已锁定，无法修改', code: 'TEAM_LOCKED' })

    if (name !== undefined) team.name = name
    if (maxMembers !== undefined) team.maxMembers = maxMembers
    if (captainId !== undefined) team.captainId = captainId
    if (index !== undefined) team.index = index
    team.updatedAt = new Date().toISOString()
    await team.save()
    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TEAM_EDIT, 'team', team.id, `更新队伍 ${team.name}`)
    res.json({ success: true, data: team.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '更新队伍失败', code: 'SERVER_ERROR' })
  }
})

// ===== DELETE /api/teams/:id =====
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const team = await RoundTeam.findOne({ id: req.params.id })
    if (!team) return res.status(404).json({ success: false, error: '队伍不存在', code: 'NOT_FOUND' })
    await RoundTeamMember.deleteMany({ teamId: team.id })
    await RoundTeam.deleteOne({ id: team.id })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: '删除队伍失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/teams/history（roundId 必填）=====
router.get('/history', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id

    const filter = roundId !== rId ? { $or: [{ roundId: rId }, { roundId: roundId }] } : { roundId: rId }

    const teams = await RoundTeam.find(filter)
    const members = await RoundTeamMember.find(filter)
    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    const membersByTeam = {}
    for (const m of members) {
      if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = []
      if (userMap[m.playerId]) membersByTeam[m.teamId].push(userMap[m.playerId])
    }

    const result = teams.map(t => ({
      id: t.id, roundId: t.roundId, roundIndex: t.roundIndex,
      name: t.name, index: t.index, maxMembers: t.maxMembers, captainId: t.captainId,
      memberIds: (membersByTeam[t.id] || []).map(u => u.id),
      members: (membersByTeam[t.id] || []).map(formatMember),
      memberCount: (membersByTeam[t.id] || []).length
    }))

    res.json({ success: true, data: result, total: result.length })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取历史失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/teams/unassigned/:roundId - 获取某轮未被分配的选手（roundId 必填）=====
router.get('/unassigned/:roundId', auth, async (req, res) => {
  try {
    const { roundId } = req.params
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id

    const members = await RoundTeamMember.find({ roundId: rId })
    const assignedIds = new Set(members.map(m => m.playerId))
    const users = await User.find({})
    const unassigned = users.filter(u =>
      u.role !== 'admin' &&
      u.status !== 'eliminated' &&
      !assignedIds.has(u.id)
    ).map(maskPlayer)

    res.json({ success: true, data: unassigned, total: unassigned.length })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取未分配选手失败', code: 'SERVER_ERROR' })
  }
})

// ===== 工具: 将选手加入队伍（复用 addMember 逻辑） =====
async function addMemberToTeam(team, playerId) {
  const currentCount = (await RoundTeamMember.find({ teamId: team.id })).length
  if (currentCount >= team.maxMembers) {
    throw Object.assign(new Error('队伍已满'), { code: 'TEAM_FULL' })
  }
  const existing = await RoundTeamMember.findOne({ teamId: team.id, playerId })
  if (existing) throw Object.assign(new Error('用户已在队伍中'), { code: 'ALREADY_IN_TEAM' })
  // 从其他队伍移除
  await RoundTeamMember.deleteMany({ roundId: team.roundId, playerId })
  const m = new RoundTeamMember({
    id: generateId(), roundId: team.roundId, roundIndex: team.roundIndex,
    teamId: team.id, playerId, createdAt: new Date().toISOString()
  })
  await m.save()
  return m
}

// ===== 工具: 校验当前用户是否为该队伍的队长 =====
async function assertIsCaptain(team, userId) {
  if (team.captainId === userId) return
  // 回退检查 RoundCaptain 记录（admin/assign 可能未更新 team.captainId）
  // 用 team.roundId 直接查询，兼容合成轮次（round-1）和真实 UUID 两种格式
  const captainRecord = await RoundCaptain.findOne({ teamId: team.id, playerId: userId })
  if (!captainRecord) throw Object.assign(new Error('仅队长可操作'), { code: 'FORBIDDEN' })
}

// ========== 邀请/申请 系统 ==========

// ===== 1. POST /api/teams/:teamId/invite - 队长邀请选手入队 =====
router.post('/:teamId/invite', auth, async (req, res) => {
  try {
    const { playerId, roundId } = req.body
    if (!playerId) return res.status(400).json({ success: false, error: 'playerId 必填', code: 'INVALID_PARAMS' })

    const team = await RoundTeam.findOne({ id: req.params.teamId })
    if (!team) return res.status(404).json({ success: false, error: '队伍不存在', code: 'NOT_FOUND' })

    // 仅队长可操作
    try { await assertIsCaptain(team, req.user.userId) }
    catch (e) { return res.status(403).json({ success: false, error: '仅队长可邀请', code: 'FORBIDDEN' }) }

    // targetPlayer 校验
    const target = await User.findOne({ id: playerId })
    if (!target) return res.status(400).json({ success: false, error: '选手不存在', code: 'USER_NOT_FOUND' })
    if (target.status === 'eliminated') return res.status(400).json({ success: false, error: '该选手已被淘汰', code: 'USER_ELIMINATED' })
    if (target.role === 'admin') return res.status(400).json({ success: false, error: '不可邀请管理员', code: 'INVALID_TARGET' })

    // 是否已在队伍
    const alreadyInTeam = await RoundTeamMember.findOne({ roundId: team.roundId, playerId })
    if (alreadyInTeam) return res.status(400).json({ success: false, error: '该选手已在队伍中', code: 'ALREADY_IN_TEAM' })

    // 清除该选手此前的邀请记录（防止重复）
    await TeamInvite.deleteMany({ teamId: team.id, targetPlayerId: playerId, roundId: team.roundId })

    // 直接使用前端传递的 roundId 原始值，不做 resolution（兼容 round-1 / UUID 两种格式）
    const rId = roundId || team.roundId

    const invite = new TeamInvite({
      id: generateId(), teamId: team.id, captainId: req.user.userId,
      targetPlayerId: playerId, roundId: rId, status: 'pending',
      createdAt: new Date().toISOString()
    })
    await invite.save()

    res.json({ success: true, data: invite })
  } catch (e) {
    console.error('Invite error:', e)
    res.status(500).json({ success: false, error: '邀请失败', code: 'SERVER_ERROR' })
  }
})

// ===== 2. POST /api/teams/:teamId/apply - 选手申请入队 =====
router.post('/:teamId/apply', auth, async (req, res) => {
  try {
    const { playerId, roundId } = req.body
    const pid = playerId || req.user.userId
    if (pid !== req.user.userId) return res.status(403).json({ success: false, error: '只能为自己申请', code: 'FORBIDDEN' })

    const team = await RoundTeam.findOne({ id: req.params.teamId })
    if (!team) return res.status(404).json({ success: false, error: '队伍不存在', code: 'NOT_FOUND' })

    const round = await Round.findOne({ $or: [{ id: team.roundId }, { index: typeof team.roundId === 'string' && team.roundId.match(/\d+/) ? parseInt(team.roundId.match(/\d+/)[0]) : null }] })
    if (round && !round.teamReleased) {
      return res.status(403).json({ success: false, error: '组队尚未开放', code: 'TEAM_NOT_RELEASED' })
    }

    if (team.locked) return res.status(403).json({ success: false, error: '队伍已锁定', code: 'TEAM_LOCKED' })

    // 是否已在队伍
    const alreadyInTeam = await RoundTeamMember.findOne({ roundId: team.roundId, playerId: pid })
    if (alreadyInTeam) return res.status(400).json({ success: false, error: '你已在队伍中', code: 'ALREADY_IN_TEAM' })

    // 直接使用原始 roundId，不做 resolution
    const rId = roundId || team.roundId

    const app = new TeamApplication({
      id: generateId(), teamId: team.id, playerId: pid,
      playerName: req.user.name || pid, roundId: rId,
      status: 'pending', createdAt: new Date().toISOString()
    })
    await app.save()

    res.json({ success: true, data: app })
  } catch (e) {
    console.error('Apply error:', e)
    res.status(500).json({ success: false, error: '申请失败', code: 'SERVER_ERROR' })
  }
})

// ===== 3. POST /api/teams/:teamId/applications/:playerId/accept - 队长同意申请 =====
router.post('/:teamId/applications/:playerId/accept', auth, async (req, res) => {
  try {
    const { roundId } = req.body
    const team = await RoundTeam.findOne({ id: req.params.teamId })
    if (!team) return res.status(404).json({ success: false, error: '队伍不存在', code: 'NOT_FOUND' })
    try { await assertIsCaptain(team, req.user.userId) }
    catch (e) { return res.status(403).json({ success: false, error: '仅队长可操作', code: 'FORBIDDEN' }) }

    const round = await Round.findOne({ $or: [{ id: team.roundId }, { index: typeof team.roundId === 'string' && team.roundId.match(/\d+/) ? parseInt(team.roundId.match(/\d+/)[0]) : null }] })
    if (round && !round.teamReleased) {
      return res.status(403).json({ success: false, error: '组队尚未开放', code: 'TEAM_NOT_RELEASED' })
    }

    const playerId = req.params.playerId
    const app = await TeamApplication.findOne({ teamId: team.id, playerId, status: 'pending' })
    if (!app) return res.status(404).json({ success: false, error: '未找到待处理的申请', code: 'APPLICATION_NOT_FOUND' })

    // 加入队伍
    await addMemberToTeam(team, playerId)

    // 删除该选手此轮的所有申请记录
    await TeamApplication.deleteMany({ playerId, roundId: app.roundId })

    // 清理该选手此轮的所有待处理邀请（已入队，其他邀请失效）
    await TeamInvite.deleteMany({ targetPlayerId: playerId, roundId: app.roundId, status: 'pending' })

    logAction(req.user.userId, req.user.name, req.user.role, ACTION_TYPES.TEAM_CHANGE, 'team', team.id,
      `队长同意了选手 ${playerId} 的入队申请`)

    res.json({ success: true, message: '已同意入队申请' })
  } catch (e) {
    if (e.code === 'TEAM_FULL') return res.status(400).json({ success: false, error: '队伍已满', code: 'TEAM_FULL' })
    if (e.code === 'ALREADY_IN_TEAM') return res.status(400).json({ success: false, error: '选手已在队伍中', code: 'ALREADY_IN_TEAM' })
    console.error('Accept application error:', e)
    res.status(500).json({ success: false, error: '处理申请失败', code: 'SERVER_ERROR' })
  }
})

// ===== 4. POST /api/teams/:teamId/applications/:playerId/reject - 队长拒绝申请 =====
router.post('/:teamId/applications/:playerId/reject', auth, async (req, res) => {
  try {
    const team = await RoundTeam.findOne({ id: req.params.teamId })
    if (!team) return res.status(404).json({ success: false, error: '队伍不存在', code: 'NOT_FOUND' })
    try { await assertIsCaptain(team, req.user.userId) }
    catch (e) { return res.status(403).json({ success: false, error: '仅队长可操作', code: 'FORBIDDEN' }) }

    const playerId = req.params.playerId
    await TeamApplication.deleteMany({ teamId: team.id, playerId, status: 'pending' })

    res.json({ success: true, message: '已拒绝入队申请' })
  } catch (e) {
    console.error('Reject application error:', e)
    res.status(500).json({ success: false, error: '拒绝申请失败', code: 'SERVER_ERROR' })
  }
})

// ===== 5. POST /api/teams/invites/:inviteId/accept - 选手接受邀请 =====
router.post('/invites/:inviteId/accept', auth, async (req, res) => {
  try {
    const invite = await TeamInvite.findOne({ id: req.params.inviteId })
    if (!invite) return res.status(404).json({ success: false, error: '邀请不存在', code: 'INVITE_NOT_FOUND' })
    if (invite.targetPlayerId !== req.user.userId) return res.status(403).json({ success: false, error: '非本人邀请', code: 'FORBIDDEN' })
    if (invite.status !== 'pending') return res.status(400).json({ success: false, error: '邀请已失效', code: 'INVITE_EXPIRED' })

    const team = await RoundTeam.findOne({ id: invite.teamId })
    if (!team) return res.status(404).json({ success: false, error: '队伍不存在', code: 'NOT_FOUND' })

    const round = await Round.findOne({ $or: [{ id: team.roundId }, { index: typeof team.roundId === 'string' && team.roundId.match(/\d+/) ? parseInt(team.roundId.match(/\d+/)[0]) : null }] })
    if (round && !round.teamReleased) {
      return res.status(403).json({ success: false, error: '组队尚未开放', code: 'TEAM_NOT_RELEASED' })
    }

    await addMemberToTeam(team, req.user.userId)

    // 删除该邀请记录
    await TeamInvite.deleteMany({ id: invite.id })

    // 清理该选手此轮的其他待处理邀请（已入队，其他邀请失效）
    await TeamInvite.deleteMany({ targetPlayerId: req.user.userId, roundId: invite.roundId, status: 'pending' })

    // 清理该选手此轮的待处理申请
    await TeamApplication.deleteMany({ playerId: req.user.userId, roundId: invite.roundId, status: 'pending' })

    logAction(req.user.userId, req.user.name, req.user.role, ACTION_TYPES.TEAM_CHANGE, 'team', team.id,
      `选手接受了队伍邀请`)

    res.json({ success: true, message: '已接受邀请' })
  } catch (e) {
    if (e.code === 'TEAM_FULL') return res.status(400).json({ success: false, error: '队伍已满', code: 'TEAM_FULL' })
    if (e.code === 'ALREADY_IN_TEAM') return res.status(400).json({ success: false, error: '你已在队伍中', code: 'ALREADY_IN_TEAM' })
    console.error('Accept invite error:', e)
    res.status(500).json({ success: false, error: '接受邀请失败', code: 'SERVER_ERROR' })
  }
})

// ===== 6. POST /api/teams/invites/:inviteId/reject - 选手拒绝邀请 =====
router.post('/invites/:inviteId/reject', auth, async (req, res) => {
  try {
    const invite = await TeamInvite.findOne({ id: req.params.inviteId })
    if (!invite) return res.status(404).json({ success: false, error: '邀请不存在', code: 'INVITE_NOT_FOUND' })
    if (invite.targetPlayerId !== req.user.userId) return res.status(403).json({ success: false, error: '非本人邀请', code: 'FORBIDDEN' })

    // 删除邀请记录
    await TeamInvite.deleteMany({ id: invite.id })

    res.json({ success: true, message: '已拒绝邀请' })
  } catch (e) {
    console.error('Reject invite error:', e)
    res.status(500).json({ success: false, error: '拒绝邀请失败', code: 'SERVER_ERROR' })
  }
})

// ===== 7. GET /api/teams/:teamId/applications?roundId= - 队长查看待处理申请 =====
router.get('/:teamId/applications', auth, async (req, res) => {
  try {
    const team = await RoundTeam.findOne({ id: req.params.teamId })
    if (!team) return res.status(404).json({ success: false, error: '队伍不存在', code: 'NOT_FOUND' })
    try { await assertIsCaptain(team, req.user.userId) }
    catch (e) { return res.status(403).json({ success: false, error: '仅队长可查看', code: 'FORBIDDEN' }) }

    const applications = await TeamApplication.find({ teamId: team.id, status: 'pending' })

    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    res.json({
      success: true,
      data: {
        applications: applications.map(a => ({
          id: a.id, playerId: a.playerId,
          playerName: a.playerName || (userMap[a.playerId] ? userMap[a.playerId].name : null),
          avatar: userMap[a.playerId] ? (userMap[a.playerId].avatar || null) : null,
          createdAt: a.createdAt
        }))
      }
    })
  } catch (e) {
    console.error('Get applications error:', e)
    res.status(500).json({ success: false, error: '获取申请列表失败', code: 'SERVER_ERROR' })
  }
})

// ===== 8. GET /api/teams/invites?playerId=&roundId= - 选手查看待处理邀请 =====
router.get('/invites', auth, async (req, res) => {
  try {
    const { playerId, roundId } = req.query
    const pid = playerId || req.user.userId
    if (pid !== req.user.userId) return res.status(403).json({ success: false, error: '仅可查看自己的邀请', code: 'FORBIDDEN' })

    const query = { targetPlayerId: pid, status: 'pending' }
    if (roundId) {
      // 直接使用原始 roundId 值匹配（兼容合成 round-1 和真实 UUID 两种格式）
      query.roundId = roundId
    }
    const invites = await TeamInvite.find(query)

    // 获取队伍信息
    const teams = await RoundTeam.find({})
    const teamMap = {}
    for (const t of teams) teamMap[t.id] = t
    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    res.json({
      success: true,
      data: {
        invites: invites.map(i => ({
          id: i.id, teamId: i.teamId,
          teamName: teamMap[i.teamId] ? teamMap[i.teamId].name : null,
          captainId: i.captainId,
          captainName: userMap[i.captainId] ? userMap[i.captainId].name : null,
          createdAt: i.createdAt
        }))
      }
    })
  } catch (e) {
    console.error('Get invites error:', e)
    res.status(500).json({ success: false, error: '获取邀请列表失败', code: 'SERVER_ERROR' })
  }
})

// ================================================================
// 分组模式：按歌分组（groupingMode = 'song'）
// 选手直接选歌，选到同一首歌的选手自动成组（歌 → 队伍一一对应）
// ================================================================

// 获取队伍集合（兼容 roundId 双格式）
async function findTeamsForRound(rId, roundId) {
  let teams = await RoundTeam.find({ roundId: rId })
  if (teams.length === 0 && rId !== roundId) {
    teams = await RoundTeam.find({ roundId: roundId })
  }
  return teams
}

// 根据队伍创建顺序建立 歌→队 映射：第 i 支队伍对应第 i 首歌
async function buildSongTeamMapping(rId, roundId) {
  const round = await getRound(roundId)
  const roundIdx = round ? round.index : null
  const frontRoundId = `round-${roundIdx}`
  const songPoolIds = round && Array.isArray(round.songPoolIds) ? round.songPoolIds : []

  // 获取本轮所有轮次歌曲（用于选歌展示）
  let roundSongs = []
  if (round && round.id) {
    roundSongs = await RoundSong.find({ roundId: { $in: [round.id, frontRoundId] } })
  }

  const teams = await findTeamsForRound(rId, roundId)
  // 歌曲按 pool 顺序排列；不足则用 RoundSong 补充
  const orderedSongIds = [...songPoolIds]
  for (const rs of roundSongs) {
    if (!orderedSongIds.includes(rs.songId)) orderedSongIds.push(rs.songId)
  }
  return { teams, orderedSongIds, round, frontRoundId }
}

// ===== GET /api/teams/song-options - 获取本轮可选的歌曲（按歌分组模式） =====
router.get('/song-options', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id
    const frontRoundId = `round-${round.index}`

    const { orderedSongIds, teams } = await buildSongTeamMapping(rId, roundId)
    const allSongs = await Song.find({})
    const songMap = {}
    for (const s of allSongs) songMap[s.id] = s

    const roundSongs = await RoundSong.find({ roundId: { $in: [rId, frontRoundId] } })
    const releasedIds = new Set(roundSongs.filter(rs => rs.released).map(rs => rs.songId))

    // 队伍容量统计
    const members = await RoundTeamMember.find({ roundId: { $in: [rId, frontRoundId] } })
    const countByTeam = {}
    for (const m of members) countByTeam[m.teamId] = (countByTeam[m.teamId] || 0) + 1

    const options = orderedSongIds.map((songId, i) => {
      const team = teams[i] || null
      const song = songMap[songId] || null
      return {
        songId,
        songName: song ? song.name : '未知歌曲',
        style: song ? song.style : '',
        index: i,
        teamId: team ? team.id : null,
        teamName: team ? team.name : `第${i + 1}团`,
        memberCount: team ? (countByTeam[team.id] || 0) : 0,
        maxMembers: team ? team.maxMembers : 0,
        released: releasedIds.has(songId) || round.songReleased || round.teamReleased
      }
    })

    res.json({ success: true, data: { roundId: round.id, roundIndex: round.index, groupingMode: round.groupingMode || 'captain', songReleased: round.songReleased || round.teamReleased, options } })
  } catch (e) {
    console.error('Get song options error:', e)
    res.status(500).json({ success: false, error: '获取歌曲选项失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/teams/select-song - 选手选歌（按歌分组模式），选同一首歌自动成组 =====
router.post('/select-song', auth, async (req, res) => {
  try {
    const { roundId, songId } = req.body
    if (!roundId || !songId) return res.status(400).json({ success: false, error: 'roundId 和 songId 必填', code: 'INVALID_PARAMS' })

    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id
    const frontRoundId = `round-${round.index}`
    const roundFilter = { $in: [rId, frontRoundId] }

    // 释放校验
    const roundDoc = await Round.findOne({ id: rId })
    if (!roundDoc.teamReleased && !roundDoc.songReleased) {
      return res.status(403).json({ success: false, error: '选歌尚未开放', code: 'TEAM_NOT_RELEASED' })
    }

    const { orderedSongIds, teams } = await buildSongTeamMapping(rId, roundId)
    const songIdx = orderedSongIds.indexOf(songId)
    if (songIdx === -1) return res.status(404).json({ success: false, error: '该歌曲不在本轮选歌池', code: 'SONG_NOT_IN_POOL' })
    const team = teams[songIdx]
    if (!team) return res.status(404).json({ success: false, error: '该歌曲对应的队伍不存在', code: 'TEAM_NOT_FOUND' })
    if (team.locked) return res.status(403).json({ success: false, error: '该队伍已锁定', code: 'TEAM_LOCKED' })

    // 容量校验
    const members = await RoundTeamMember.find({ roundId: roundFilter })
    const countByTeam = {}
    for (const m of members) countByTeam[m.teamId] = (countByTeam[m.teamId] || 0) + 1
    if ((countByTeam[team.id] || 0) >= team.maxMembers) {
      return res.status(409).json({ success: false, error: '该歌曲队伍已满员', code: 'TEAM_FULL' })
    }

    const pid = req.user.userId
    // 移除该选手本轮的旧组队记录（如果有）
    const existing = await RoundTeamMember.find({ roundId: roundFilter, playerId: pid })
    for (const e of existing) await RoundTeamMember.deleteOne({ id: e.id })
    // 清理旧申请/邀请
    await TeamApplication.deleteMany({ playerId: pid, roundId: { $in: [rId, frontRoundId] } })
    await TeamInvite.deleteMany({ targetPlayerId: pid, roundId: { $in: [rId, frontRoundId] } })

    // 加入队伍
    const member = new RoundTeamMember({
      id: generateId(), roundId: frontRoundId, roundIndex: round.index,
      teamId: team.id, playerId: pid, createdAt: new Date().toISOString()
    })
    await member.save()

    // 建立歌→队正式分配（与结算/展示逻辑一致），并写入 TeamSong 记录
    const roundSong = await RoundSong.findOne({ roundId: { $in: [rId, frontRoundId] }, songId })
    if (roundSong && !roundSong.assignedTeamId) {
      roundSong.assignedTeamId = team.id
      roundSong.updatedAt = new Date().toISOString()
      await roundSong.save()
    }
    const existingTeamSong = await require('../models/TeamSong').findOne({ roundId: { $in: [rId, frontRoundId] }, teamId: team.id })
    if (!existingTeamSong) {
      const TeamSong = require('../models/TeamSong')
      const ts = new TeamSong({
        id: generateId(), roundId: frontRoundId, roundIndex: round.index,
        teamId: team.id, songId, assignedBy: req.user.userId, createdAt: new Date().toISOString()
      })
      await ts.save()
    }

    logAction(pid, req.user.name || pid, req.user.role, ACTION_TYPES.TEAM_EDIT, 'roundTeam', team.id, `按歌分组选择歌曲`)
    res.json({ success: true, data: { teamId: team.id, teamName: team.name, songId, songName: orderedSongIds.includes(songId) ? (await Song.findOne({ id: songId }))?.name || '' : '' } })
  } catch (e) {
    console.error('Select song error:', e)
    res.status(500).json({ success: false, error: '选歌失败', code: 'SERVER_ERROR' })
  }
})

// ================================================================
// 分组模式：意向队长（groupingMode = 'captain_choice'）
// 先选队长，选手选择意向队长，管理员触发按意向匹配分组
// ================================================================

// ===== POST /api/teams/preference - 选手提交意向队长 =====
router.post('/preference', auth, async (req, res) => {
  try {
    const { roundId, preferredCaptainId } = req.body
    if (!roundId || !preferredCaptainId) return res.status(400).json({ success: false, error: 'roundId 和 preferredCaptainId 必填', code: 'INVALID_PARAMS' })

    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id
    const frontRoundId = `round-${round.index}`
    const roundFilter = { $in: [rId, frontRoundId] }

    const pid = req.user.userId
    if (pid === preferredCaptainId) return res.status(400).json({ success: false, error: '不能选择自己作为意向队长', code: 'SELF_PREFERENCE' })

    // 已提交过意向则不允许修改（每位选手只能提交一次）
    const existingPref = await TeamApplication.findOne({ roundId: roundFilter, playerId: pid, status: 'pending' })
    if (existingPref) {
      const existingUsers = await User.find({})
      const existingUserMap = {}
      for (const u of existingUsers) existingUserMap[u.id] = u
      return res.status(409).json({
        success: false,
        error: '你已提交过意向队长，不可修改',
        code: 'PREFERENCE_ALREADY_SUBMITTED',
        data: {
          preferredCaptainId: existingPref.preferredCaptainId || existingPref.playerName || null,
          preferredCaptainName: existingUserMap[existingPref.preferredCaptainId] ? existingUserMap[existingPref.preferredCaptainId].name : null
        }
      })
    }

    // 校验目标队长存在（RoundCaptain 记录或对应队伍）
    const captains = await RoundCaptain.find({ roundId: roundFilter })
    const captainPlayerIds = new Set(captains.map(c => c.playerId))
    const captainTeams = await RoundTeam.find({ roundId: roundFilter })
    const captainTeamIds = new Set(captainTeams.filter(t => t.captainId).map(t => t.captainId))
    if (!captainPlayerIds.has(preferredCaptainId) && !captainTeamIds.has(preferredCaptainId)) {
      return res.status(404).json({ success: false, error: '目标队长不存在', code: 'CAPTAIN_NOT_FOUND' })
    }

    // 存储意向：使用 RoundTeamMember 之外的自定义表（TeamApplication 复用作"意向队长"，teamId 存队长对应队伍）
    // 简化：直接用 TeamApplication 表，teamId 存队长的队伍 id，preferredCaptainId 存于 playerName 字段标记
    // 更清晰方案：写入 TeamApplication { playerId, teamId: 队长队伍, status:'pending' }
    let captainTeam = null
    for (const t of captainTeams) {
      if (t.captainId === preferredCaptainId) { captainTeam = t; break }
    }
    if (!captainTeam) {
      // 队长没有队伍时，找第一个可用的空队伍（或报错）
      const availableTeams = captainTeams.filter(t => !t.captainId)
      if (availableTeams.length === 0) return res.status(409).json({ success: false, error: '队长尚未分配队伍，请先设置队伍', code: 'NO_TEAM_FOR_CAPTAIN' })
      captainTeam = availableTeams[0]
    }

    // 删除旧意向
    await TeamApplication.deleteMany({ playerId: pid, roundId: { $in: [rId, frontRoundId] } })
    const app = new TeamApplication({
      id: generateId(), teamId: captainTeam.id, playerId: pid, playerName: preferredCaptainId,
      roundId: frontRoundId, status: 'pending', preferredCaptainId,
      createdAt: new Date().toISOString()
    })
    await app.save()

    res.json({ success: true, data: { preferredCaptainId, teamId: captainTeam.id } })
  } catch (e) {
    console.error('Submit preference error:', e)
    res.status(500).json({ success: false, error: '提交意向失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/teams/preferences - 查询本轮所有意向（管理员/选手） =====
router.get('/preferences', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id
    const frontRoundId = `round-${round.index}`
    const roundFilter = { $in: [rId, frontRoundId] }

    const apps = await TeamApplication.find({ roundId: roundFilter, status: 'pending' })
    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u
    const captains = await RoundCaptain.find({ roundId: roundFilter })
    const captainTeamMap = {}
    for (const c of captains) captainTeamMap[c.playerId] = c.teamId

    const list = apps.map(a => {
      // 意向队长 ID：优先 preferredCaptainId 字段；旧数据回退 playerName（且 playerName 不能等于提交者自己）
      let prefCaptainId = a.preferredCaptainId || null
      if (!prefCaptainId && a.playerName && a.playerName !== a.playerId) {
        prefCaptainId = a.playerName
      }
      const prefUser = prefCaptainId ? userMap[prefCaptainId] : null
      return {
        playerId: a.playerId,
        playerName: userMap[a.playerId] ? userMap[a.playerId].name : a.playerId,
        preferredCaptainId: prefCaptainId,
        preferredCaptainName: prefUser ? prefUser.name : (prefCaptainId || null),
        teamId: a.teamId
      }
    })

    res.json({ success: true, data: { roundId: round.id, preferences: list, count: list.length } })
  } catch (e) {
    console.error('Get preferences error:', e)
    res.status(500).json({ success: false, error: '获取意向失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/teams/my-preference - 选手查询自己的意向 =====
router.get('/my-preference', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id
    const frontRoundId = `round-${round.index}`
    const roundFilter = { $in: [rId, frontRoundId] }

    const app = await TeamApplication.findOne({ roundId: roundFilter, playerId: req.user.userId, status: 'pending' })
    if (!app) return res.json({ success: true, data: null })
    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u
    // 意向队长 ID：优先 preferredCaptainId 字段；旧数据回退 playerName（不能等于提交者自己）
    let prefCaptainId = app.preferredCaptainId || null
    if (!prefCaptainId && app.playerName && app.playerName !== app.playerId) {
      prefCaptainId = app.playerName
    }
    const prefUser = prefCaptainId ? userMap[prefCaptainId] : null
    res.json({
      success: true,
      data: {
        preferredCaptainId: prefCaptainId,
        preferredCaptainName: prefUser ? prefUser.name : (prefCaptainId || null),
        teamId: app.teamId
      }
    })
  } catch (e) {
    console.error('Get my preference error:', e)
    res.status(500).json({ success: false, error: '获取意向失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/teams/match-preferences - 管理员触发按意向匹配分组 =====
router.post('/match-preferences', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId } = req.body
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'INVALID_PARAMS' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id
    const frontRoundId = `round-${round.index}`
    const roundFilter = { $in: [rId, frontRoundId] }

    // 1. 清理旧组队
    await RoundTeamMember.deleteMany({ roundId: roundFilter })

    // 2. 收集所有意向（按提交顺序）
    const apps = await TeamApplication.find({ roundId: roundFilter, status: 'pending' })
    const allUsers = await User.find({ role: { $ne: 'admin' }, status: 'active' })
    const userMap = {}
    for (const u of allUsers) userMap[u.id] = u

    // 3. 队伍及其容量
    const teams = await findTeamsForRound(rId, roundId)
    const teamById = {}
    const capacity = {}
    for (const t of teams) {
      teamById[t.id] = t
      capacity[t.id] = t.maxMembers
    }
    // 初始占用：队长占自己的队伍
    const captains = await RoundCaptain.find({ roundId: roundFilter })
    const occupied = {}
    const captainUserId = {}
    for (const c of captains) {
      if (c.teamId && teamById[c.teamId]) {
        occupied[c.teamId] = [c.playerId]
        capacity[c.teamId] = Math.max(0, capacity[c.teamId] - 1)
        captainUserId[c.playerId] = c.teamId
      }
    }
    // 兜底：队伍 captainId 字段
    for (const t of teams) {
      if (t.captainId && !occupied[t.id]) {
        occupied[t.id] = [t.captainId]
        capacity[t.id] = Math.max(0, capacity[t.id] - 1)
        captainUserId[t.captainId] = t.id
      }
    }

    const placed = new Set()
    for (const t of teams) for (const p of (occupied[t.id] || [])) placed.add(p)

    // 4. 按意向匹配（贪心：先到先得）
    const addedMembers = []
    for (const app of apps) {
      let prefCaptainId = app.preferredCaptainId || null
      if (!prefCaptainId && app.playerName && app.playerName !== app.playerId) {
        prefCaptainId = app.playerName
      }
      if (!prefCaptainId) continue
      const pid = app.playerId
      if (placed.has(pid)) continue
      const targetTeamId = captainUserId[prefCaptainId]
      if (!targetTeamId || !teamById[targetTeamId]) continue
      if (capacity[targetTeamId] <= 0) continue
      // 加入目标队伍
      const member = new RoundTeamMember({
        id: generateId(), roundId: frontRoundId, roundIndex: round.index,
        teamId: targetTeamId, playerId: pid, createdAt: new Date().toISOString()
      })
      await member.save()
      capacity[targetTeamId]--
      placed.add(pid)
      addedMembers.push({ playerId: pid, playerName: userMap[pid] ? userMap[pid].name : pid, teamId: targetTeamId, teamName: teamById[targetTeamId].name })
    }

    // 5. 未匹配的选手随机补位到有空位的队伍
    const randomFill = []
    for (const u of allUsers) {
      if (placed.has(u.id)) continue
      const available = teams.filter(t => capacity[t.id] > 0)
      if (available.length === 0) break
      const team = available[Math.floor(Math.random() * available.length)]
      const member = new RoundTeamMember({
        id: generateId(), roundId: frontRoundId, roundIndex: round.index,
        teamId: team.id, playerId: u.id, createdAt: new Date().toISOString()
      })
      await member.save()
      capacity[team.id]--
      placed.add(u.id)
      randomFill.push({ playerId: u.id, playerName: u.name, teamId: team.id, teamName: team.name })
    }

    // 6. 清理意向记录
    await TeamApplication.deleteMany({ roundId: roundFilter, status: 'pending' })

    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TEAM_CHANGE, 'round', rId, `按意向队长匹配：${addedMembers.length} 人按意向，${randomFill.length} 人随机补位`)
    res.json({
      success: true,
      data: {
        matchedByPreference: addedMembers.length,
        randomFill: randomFill.length,
        matched: addedMembers,
        randomFilled: randomFill
      }
    })
  } catch (e) {
    console.error('Match preferences error:', e)
    res.status(500).json({ success: false, error: '匹配失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/teams/assign-preferences - 管理员逐条/批量分配意向（带容量校验） =====
router.post('/assign-preferences', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, playerIds } = req.body
    if (!roundId || !Array.isArray(playerIds) || playerIds.length === 0) {
      return res.status(400).json({ success: false, error: 'roundId 和 playerIds 必填', code: 'INVALID_PARAMS' })
    }
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id
    const frontRoundId = `round-${round.index}`
    const roundFilter = { $in: [rId, frontRoundId] }

    // 收集这些选手的意向
    const apps = await TeamApplication.find({ roundId: roundFilter, status: 'pending', playerId: { $in: playerIds } })
    const appByPlayer = {}
    for (const a of apps) {
      let prefCaptainId = a.preferredCaptainId || null
      if (!prefCaptainId && a.playerName && a.playerName !== a.playerId) prefCaptainId = a.playerName
      appByPlayer[a.playerId] = prefCaptainId
    }

    // 意向队长 → 队伍映射
    const captains = await RoundCaptain.find({ roundId: roundFilter })
    const captainTeamMap = {}
    for (const c of captains) captainTeamMap[c.playerId] = c.teamId
    const teams = await RoundTeam.find({ roundId: roundFilter })
    const teamByCaptain = {}
    for (const t of teams) if (t.captainId) teamByCaptain[t.captainId] = t
    for (const t of teams) if (!t.captainId && captainTeamMap[t.id]) teamByCaptain[captainTeamMap[t.id]] = t

    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    // 逐条分配（校验容量）
    const assigned = []
    const errors = []
    const assignedTeamCap = {}
    for (const pid of playerIds) {
      const prefCaptainId = appByPlayer[pid]
      let team = null
      if (prefCaptainId) {
        team = teamByCaptain[prefCaptainId] || (captainTeamMap[prefCaptainId] ? teams.find(t => t.id === captainTeamMap[prefCaptainId]) : null)
      }
      if (!team) {
        errors.push({ playerId: pid, playerName: userMap[pid] ? userMap[pid].name : pid, error: '该选手未提交有效意向或意向队长未分配队伍' })
        continue
      }
      // 容量检查（含本次已分配）
      const currentCount = (await RoundTeamMember.find({ teamId: team.id })).length
      const alreadyAssigned = assignedTeamCap[team.id] || 0
      if (currentCount + alreadyAssigned >= team.maxMembers) {
        errors.push({ playerId: pid, playerName: userMap[pid] ? userMap[pid].name : pid, error: `队伍「${team.name}」已满员` })
        continue
      }
      try {
        await addMemberToTeam(team, pid)
        assignedTeamCap[team.id] = alreadyAssigned + 1
        assigned.push({ playerId: pid, playerName: userMap[pid] ? userMap[pid].name : pid, teamId: team.id, teamName: team.name })
        // 分配成功后删除该意向
        await TeamApplication.deleteMany({ roundId: roundFilter, playerId: pid, status: 'pending' })
      } catch (e) {
        errors.push({ playerId: pid, playerName: userMap[pid] ? userMap[pid].name : pid, error: e.message })
      }
    }

    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TEAM_CHANGE, 'round', rId, `分配意向：成功 ${assigned.length} 条，失败 ${errors.length} 条`)
    res.json({ success: true, data: { assignedCount: assigned.length, errorCount: errors.length, assigned, errors } })
  } catch (e) {
    console.error('Assign preferences error:', e)
    res.status(500).json({ success: false, error: '分配失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/teams/grouping-mode - 获取本轮分组模式（选手/管理员均可读） =====
router.get('/grouping-mode', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    res.json({ success: true, data: { roundId: round.id, roundIndex: round.index, groupingMode: round.groupingMode || 'captain' } })
  } catch (e) {
    console.error('Get grouping mode error:', e)
    res.status(500).json({ success: false, error: '获取分组模式失败', code: 'SERVER_ERROR' })
  }
})

// ================================================================
// 统一分组结果：三种分组模式最终都产出统一结构
// 若干队伍（每队配置人数、队长、对应一首歌曲）
// ================================================================

// ===== GET /api/teams/group-result - 获取本轮统一的分组结果 =====
router.get('/group-result', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id
    const frontRoundId = `round-${round.index}`
    const roundFilter = { $in: [rId, frontRoundId] }

    const [teams, members, teamSongs, roundSongs, allSongs, allUsers, captains] = await Promise.all([
      RoundTeam.find({ roundId: roundFilter }),
      RoundTeamMember.find({ roundId: roundFilter }),
      require('../models/TeamSong').find({ roundId: roundFilter }),
      RoundSong.find({ roundId: roundFilter }),
      Song.find({}),
      User.find({}),
      RoundCaptain.find({ roundId: roundFilter })
    ])

    const songMap = {}
    for (const s of allSongs) songMap[s.id] = s
    const userMap = {}
    for (const u of allUsers) userMap[u.id] = u
    const captainTeamMap = {}
    for (const c of captains) captainTeamMap[c.playerId] = c.teamId

    const membersByTeam = {}
    for (const m of members) {
      if (!membersByTeam[m.teamId]) membersByTeam[m.teamId] = []
      membersByTeam[m.teamId].push(m)
    }
    const teamSongByTeam = {}
    for (const ts of teamSongs) teamSongByTeam[ts.teamId] = ts
    const roundSongBySongId = {}
    for (const rs of roundSongs) roundSongBySongId[rs.songId] = rs

    const result = teams.map(team => {
      const ts = teamSongByTeam[team.id]
      const songId = ts ? ts.songId : null
      const roundSong = songId ? roundSongBySongId[songId] : null
      const song = songId ? songMap[songId] : null
      const teamMembers = (membersByTeam[team.id] || []).map(m => ({
        playerId: m.playerId,
        playerName: userMap[m.playerId] ? userMap[m.playerId].name : m.playerId
      }))
      // 队长：优先 team.captainId，回退 RoundCaptain
      const captainId = team.captainId || (teamMembers.find(mm => captainTeamMap[mm.playerId] === team.id)?.playerId || null)
      return {
        teamId: team.id,
        teamName: team.name,
        teamIndex: team.index || null,
        maxMembers: team.maxMembers,
        captainId,
        captainName: captainId && userMap[captainId] ? userMap[captainId].name : null,
        songId,
        songName: song ? song.name : (roundSong && songMap[roundSong.songId] ? songMap[roundSong.songId].name : null),
        songReleased: roundSong ? !!roundSong.released : (round.songReleased || round.teamReleased),
        memberCount: teamMembers.length,
        members: teamMembers,
        locked: team.locked || false
      }
    })

    res.json({
      success: true,
      data: {
        roundId: round.id,
        roundIndex: round.index,
        groupingMode: round.groupingMode || 'captain',
        totalTeams: result.length,
        teams: result
      }
    })
  } catch (e) {
    console.error('Get group result error:', e)
    res.status(500).json({ success: false, error: '获取分组结果失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
