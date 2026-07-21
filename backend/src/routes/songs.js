const express = require('express')
const { auth, requireAdmin } = require('../middleware/auth')
const { generateId, logAction, getCurrentSeason, ACTION_TYPES } = require('../utils/helpers')
const Song = require('../models/Song')
const RoundSong = require('../models/RoundSong')
const TeamSong = require('../models/TeamSong')
const RoundTeam = require('../models/RoundTeam')
const Round = require('../models/Round')
const User = require('../models/User')

const router = express.Router()

async function getRound(roundId) {
  if (roundId) {
    const r = await Round.findOne({ id: roundId })
    if (r) return r
    // 兼容 round-1 / round_1 格式
    const match = roundId.match(/^round[_-](\d+)$/)
    if (match) {
      const idx = parseInt(match[1])
      const season = await getCurrentSeason()
      if (season) {
        const r2 = await Round.findOne({ seasonId: season.id, index: idx })
        if (r2) return r2
        return { id: `round-${idx}`, index: idx }
      }
    }
    return null
  }
  const season = await getCurrentSeason()
  if (!season) return null
  return await Round.findOne({ seasonId: season.id, index: season.currentRound })
}

// ===== GET /api/songs - 歌曲库 =====
router.get('/', auth, async (req, res) => {
  try {
    const { type, style, keyword } = req.query
    const filter = {}
    if (type) filter.type = type
    if (style) filter.style = style
    let songs = await Song.find(filter)
    if (keyword) {
      const k = keyword.toLowerCase()
      songs = songs.filter(s => (s.name || '').toLowerCase().includes(k) || (s.style || '').toLowerCase().includes(k))
    }
    songs.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    res.json({ success: true, data: songs, total: songs.length })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取歌曲失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/songs - 新增歌曲 =====
router.post('/', auth, requireAdmin, async (req, res) => {
  try {
    const { name, style, difficulty, vocalWeight, danceWeight, charmWeight, baseScore, riskFactor, description, type } = req.body
    if (!name) return res.status(400).json({ success: false, error: 'name 必填', code: 'INVALID_PARAMS' })
    const song = new Song({
      id: generateId(), name, style: style || '流行',
      difficulty: typeof difficulty === 'number' ? difficulty : 3,
      vocalWeight: typeof vocalWeight === 'number' ? vocalWeight : 3,
      danceWeight: typeof danceWeight === 'number' ? danceWeight : 3,
      charmWeight: typeof charmWeight === 'number' ? charmWeight : 3,
      baseScore: typeof baseScore === 'number' ? baseScore : 100,
      riskFactor: typeof riskFactor === 'number' ? riskFactor : 0.2,
      description: description || '', type: type || 'team_show',
      enabled: true, createdAt: new Date().toISOString()
    })
    await song.save()
    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.SONG_LIBRARY_ADD, 'song', song.id, `新增 ${name}`)
    res.json({ success: true, data: song })
  } catch (e) {
    res.status(500).json({ success: false, error: '新增失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/songs/batch - 批量导入歌曲 =====
router.post('/batch', auth, requireAdmin, async (req, res) => {
  try {
    const { songs } = req.body
    if (!Array.isArray(songs) || songs.length === 0) {
      return res.status(400).json({ success: false, error: 'songs 数组必填且不能为空', code: 'INVALID_PARAMS' })
    }
    const results = []
    for (const item of songs) {
      if (!item.name) continue
      const song = new Song({
        id: generateId(),
        name: item.name,
        style: item.style || '流行',
        type: item.type || 'team_show',
        difficulty: typeof item.difficulty === 'number' ? item.difficulty : 3,
        vocalWeight: typeof item.vocalWeight === 'number' ? item.vocalWeight : 3,
        danceWeight: typeof item.danceWeight === 'number' ? item.danceWeight : 3,
        charmWeight: typeof item.charmWeight === 'number' ? item.charmWeight : 3,
        baseScore: typeof item.baseScore === 'number' ? item.baseScore : 100,
        riskFactor: typeof item.riskFactor === 'number' ? item.riskFactor : 0.2,
        description: item.description || '',
        enabled: true,
        createdAt: new Date().toISOString()
      })
      await song.save()
      results.push(song)
    }
    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.SONG_LIBRARY_ADD, 'song', 'batch', `批量导入 ${results.length} 首歌曲`)
    res.json({ success: true, data: results, count: results.length })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '批量导入失败', code: 'SERVER_ERROR' })
  }
})

// ===== PUT /api/songs/:id - 更新歌曲 =====
router.put('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const song = await Song.findOne({ id: req.params.id })
    if (!song) return res.status(404).json({ success: false, error: '歌曲不存在', code: 'NOT_FOUND' })
    const fields = ['name', 'style', 'difficulty', 'vocalWeight', 'danceWeight', 'charmWeight', 'baseScore', 'riskFactor', 'description', 'type', 'enabled']
    for (const f of fields) if (req.body[f] !== undefined) song[f] = req.body[f]
    song.updatedAt = new Date().toISOString()
    await song.save()
    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.SONG_LIBRARY_EDIT, 'song', song.id, `编辑 ${song.name}`)
    res.json({ success: true, data: song })
  } catch (e) {
    res.status(500).json({ success: false, error: '更新失败', code: 'SERVER_ERROR' })
  }
})

// ===== DELETE /api/songs/:id - 删除歌曲 =====
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    await Song.deleteOne({ id: req.params.id })
    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.SONG_LIBRARY_DELETE, 'song', req.params.id, '删除歌曲')
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: '删除失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/songs/round/batch - 把歌曲添加到本轮公演 =====
router.post('/round/batch', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, songs } = req.body
    if (!Array.isArray(songs)) return res.status(400).json({ success: false, error: 'songs 必填', code: 'INVALID_PARAMS' })
    const round = await getRound(roundId)
    const rId = round ? round.id : (roundId || 'default-round')
    const rIdx = round ? round.index : null
    const results = []
    for (const item of songs) {
      const existing = await RoundSong.findOne({ roundId: rId, songId: item.songId })
      if (existing) continue
      const rs = new RoundSong({
        id: generateId(), roundId: rId, roundIndex: rIdx,
        songId: item.songId, songType: item.songType || 'team_show',
        scoringMethod: item.scoringMethod || 'actual', createdAt: new Date().toISOString()
      })
      await rs.save()
      results.push(rs)
    }
    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.ROUND_SONG_ADD, 'round', rId, `添加 ${results.length} 首轮次歌曲`)
    res.json({ success: true, data: results, count: results.length })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '批量添加失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/songs/round/:roundId? - 获取本轮歌曲（含详情） =====
router.get('/round/:roundId?', auth, async (req, res) => {
  try {
    const { roundId } = req.params
    const round = roundId ? await getRound(roundId) : await getRound()
    const rId = round ? round.id : roundId
    if (!rId) return res.json({ success: true, data: [], total: 0 })

    const roundSongs = await RoundSong.find({ roundId: rId })
    const allSongs = await Song.find({})
    const songMap = {}
    for (const s of allSongs) songMap[s.id] = s

    const teamSongs = await TeamSong.find({ roundId: rId })
    const teamSongByTeam = {}
    for (const ts of teamSongs) teamSongByTeam[ts.teamId] = ts

    const teams = await RoundTeam.find({ roundId: rId })
    const teamMap = {}
    for (const t of teams) teamMap[t.id] = t

    // 从 TeamSong 表构建 songId -> teamId 的映射
    const teamSongBySongId = {}
    for (const ts of teamSongs) {
      if (!teamSongBySongId[ts.songId]) teamSongBySongId[ts.songId] = []
      teamSongBySongId[ts.songId].push(ts)
    }

    const enriched = roundSongs.map(rs => {
      // 优先从 TeamSong 表查分配状态（兼容旧接口），其次用 RoundSong.assignedTeamId
      const tsList = teamSongBySongId[rs.songId] || []
      const assignedTeamId = tsList.length > 0 ? tsList[0].teamId : (rs.assignedTeamId || null)
      return {
        id: rs.id, roundId: rs.roundId, roundIndex: rs.roundIndex,
        songId: rs.songId, songType: rs.songType, scoringMethod: rs.scoringMethod,
        assignedTeamId,
        assignedTeamName: assignedTeamId && teamMap[assignedTeamId] ? teamMap[assignedTeamId].name : null,
        released: rs.released || false,
        releasedAt: rs.releasedAt || null,
        song: songMap[rs.songId] || null, songName: songMap[rs.songId] ? songMap[rs.songId].name : null,
        assigned: tsList.map(ts => ({
          teamId: ts.teamId, teamName: teamMap[ts.teamId] ? teamMap[ts.teamId].name : null, assignedBy: ts.assignedBy
        })),
        createdAt: rs.createdAt
      }
    })
    res.json({ success: true, data: enriched, total: enriched.length })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取轮次歌曲失败', code: 'SERVER_ERROR' })
  }
})

// ===== DELETE /api/songs/round/:id - 移除单条轮次歌曲 =====
router.delete('/round/:id', auth, requireAdmin, async (req, res) => {
  try {
    const rs = await RoundSong.findOne({ id: req.params.id })
    if (!rs) return res.status(404).json({ success: false, error: '未找到轮次歌曲', code: 'NOT_FOUND' })
    await TeamSong.deleteMany({ roundId: rs.roundId, songId: rs.songId })
    await RoundSong.deleteOne({ id: req.params.id })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: '删除失败', code: 'SERVER_ERROR' })
  }
})

// ===== DELETE /api/songs/round/clear/:roundId? - 清空本轮歌曲 =====
router.delete('/round/clear/:roundId?', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId } = req.params
    const round = roundId ? await getRound(roundId) : await getRound()
    const rId = round ? round.id : roundId
    if (!rId) return res.json({ success: true })
    await TeamSong.deleteMany({ roundId: rId })
    await RoundSong.deleteMany({ roundId: rId })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: '清空失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/songs/team-songs - 队伍选择歌曲（核心分配，增量更新） =====
router.post('/team-songs', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, assignments } = req.body
    // assignments: [{ teamId, songId }]
    if (!Array.isArray(assignments)) return res.status(400).json({ success: false, error: 'assignments 必填', code: 'INVALID_PARAMS' })

    const round = await getRound(roundId)
    const rId = round ? round.id : (roundId || 'default-round')
    const rIdx = round ? round.index : null

    // 验证:song 必须在 RoundSong 中
    const roundSongs = await RoundSong.find({ roundId: rId })
    const roundSongIds = new Set(roundSongs.map(rs => rs.songId))
    const roundSongMap = {}
    for (const rs of roundSongs) roundSongMap[rs.songId] = rs

    // 删除涉及本次 assignments 中的 teamId 的旧分配（避免重复）
    const teamIds = [...new Set(assignments.filter(a => a.teamId).map(a => a.teamId))]
    if (teamIds.length) await TeamSong.deleteMany({ roundId: rId, teamId: { $in: teamIds } })

    // 同步更新 RoundSong 的 assignedTeamId（清空这些 teamId 在其他歌曲上的分配）
    for (const rs of roundSongs) {
      if (rs.assignedTeamId && teamIds.includes(rs.assignedTeamId)) {
        rs.assignedTeamId = null
        rs.updatedAt = new Date().toISOString()
        await rs.save()
      }
    }

    const results = []
    for (const item of assignments) {
      if (!item.teamId || !item.songId) continue
      if (!roundSongIds.has(item.songId)) continue
      const rs = roundSongMap[item.songId]
      // 同一首歌不能分配给多个队伍
      const existing = await TeamSong.findOne({ roundId: rId, songId: item.songId })
      if (existing) continue
      const ts = new TeamSong({
        id: generateId(), roundId: rId, roundIndex: rIdx,
        teamId: item.teamId, songId: item.songId,
        assignedBy: req.user.userId, createdAt: new Date().toISOString()
      })
      await ts.save()
      // 同步 RoundSong
      if (rs && !rs.assignedTeamId) {
        rs.assignedTeamId = item.teamId
        rs.updatedAt = new Date().toISOString()
        await rs.save()
      }
      results.push(ts)
    }
    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TEAM_SONG_ASSIGN, 'round', rId, `分配 ${results.length} 首歌曲`)
    res.json({ success: true, data: results, count: results.length })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '分配失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/songs/team-songs/batch - 批量分配（增量更新） =====
router.post('/team-songs/batch', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, assignments } = req.body
    if (!Array.isArray(assignments)) return res.status(400).json({ success: false, error: 'assignments 必填', code: 'INVALID_PARAMS' })

    const round = await getRound(roundId)
    const rId = round ? round.id : (roundId || 'default-round')
    const rIdx = round ? round.index : null

    const roundSongs = await RoundSong.find({ roundId: rId })
    const roundSongIds = new Set(roundSongs.map(rs => rs.songId))
    const roundSongMap = {}
    for (const rs of roundSongs) roundSongMap[rs.songId] = rs

    const teamIds = [...new Set(assignments.filter(a => a.teamId).map(a => a.teamId))]
    if (teamIds.length) await TeamSong.deleteMany({ roundId: rId, teamId: { $in: teamIds } })

    for (const rs of roundSongs) {
      if (rs.assignedTeamId && teamIds.includes(rs.assignedTeamId)) {
        rs.assignedTeamId = null
        rs.updatedAt = new Date().toISOString()
        await rs.save()
      }
    }

    const results = []
    for (const item of assignments) {
      if (!item.teamId || !item.songId) continue
      if (!roundSongIds.has(item.songId)) continue
      const existing = await TeamSong.findOne({ roundId: rId, songId: item.songId })
      if (existing) continue
      const rs = roundSongMap[item.songId]
      const ts = new TeamSong({
        id: generateId(), roundId: rId, roundIndex: rIdx, teamId: item.teamId,
        songId: item.songId, assignedBy: req.user.userId, createdAt: new Date().toISOString()
      })
      await ts.save()
      if (rs && !rs.assignedTeamId) {
        rs.assignedTeamId = item.teamId
        rs.updatedAt = new Date().toISOString()
        await rs.save()
      }
      results.push(ts)
    }
    res.json({ success: true, data: results, count: results.length })
  } catch (e) {
    res.status(500).json({ success: false, error: '批量分配失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/songs/team-songs?roundId=xxx - 获取队伍歌曲分配记录 =====
router.get('/team-songs', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    const round = roundId ? await getRound(roundId) : await getRound()
    const rId = round ? round.id : roundId
    const filter = {}
    if (rId) filter.roundId = rId

    const [teamSongs, songs, teams] = await Promise.all([
      TeamSong.find(filter), Song.find({}), RoundTeam.find(rId ? { roundId: rId } : {})
    ])
    const songMap = {}, teamMap = {}
    for (const s of songs) songMap[s.id] = s
    for (const t of teams) teamMap[t.id] = t

    const enriched = teamSongs.map(ts => ({
      id: ts.id, roundId: ts.roundId, roundIndex: ts.roundIndex,
      teamId: ts.teamId, teamName: teamMap[ts.teamId] ? teamMap[ts.teamId].name : null,
      songId: ts.songId, song: songMap[ts.songId] || null,
      songName: songMap[ts.songId] ? songMap[ts.songId].name : null,
      assignedBy: ts.assignedBy, createdAt: ts.createdAt
    }))
    res.json({ success: true, data: enriched, total: enriched.length })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取分配失败', code: 'SERVER_ERROR' })
  }
})

// ===== DELETE /api/songs/team-songs/:id - 删除单条分配 =====
router.delete('/team-songs/:id', auth, requireAdmin, async (req, res) => {
  try {
    await TeamSong.deleteOne({ id: req.params.id })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: '删除失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/songs/history =====
router.get('/history', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    const round = roundId ? await getRound(roundId) : await getRound()
    const rId = round ? round.id : roundId
    const filter = {}
    if (rId) filter.roundId = rId

    const [roundSongs, teamSongs] = await Promise.all([RoundSong.find(filter), TeamSong.find(filter)])
    res.json({
      success: true,
      data: { roundSongs, teamSongs, roundId: rId, total: roundSongs.length + teamSongs.length }
    })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取历史失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/songs/release - 释放歌曲（管理员） =====
router.post('/release', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, roundSongId } = req.body
    if (!roundId || !roundSongId) {
      return res.status(400).json({ success: false, error: '缺少 roundId 或 roundSongId', code: 'MISSING_PARAM' })
    }
    // 兼容 roundId 格式：支持 UUID 和 round-1 两种格式
    const round = await getRound(roundId)
    const dbRoundId = round ? round.id : roundId
    // 同时查询两种 roundId 格式
    const roundSong = await RoundSong.findOne({
      id: roundSongId,
      $or: [{ roundId: dbRoundId }, { roundId: roundId }]
    })
    if (!roundSong) {
      return res.status(404).json({ success: false, error: '歌曲不存在', code: 'SONG_NOT_FOUND' })
    }
    if (roundSong.assignedTeamId) {
      return res.status(400).json({ success: false, error: '该歌曲已被分配，无法释放', code: 'SONG_ALREADY_ASSIGNED' })
    }
    if (roundSong.released) {
      return res.status(400).json({ success: false, error: '该歌曲已释放', code: 'SONG_ALREADY_RELEASED' })
    }
    roundSong.released = true
    roundSong.releasedAt = new Date().toISOString()
    roundSong.updatedAt = new Date().toISOString()
    await roundSong.save()
    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.SONG_LIBRARY_EDIT, 'roundSong', roundSongId, '释放歌曲')
    res.json({ success: true, data: { id: roundSong.id, released: true, releasedAt: roundSong.releasedAt } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '释放歌曲失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/songs/claim - 抢选歌曲（队长） =====
router.post('/claim', auth, async (req, res) => {
  try {
    const { roundId, roundSongId, teamId } = req.body
    if (!roundId || !roundSongId || !teamId) {
      return res.status(400).json({ success: false, error: '缺少 roundId、roundSongId 或 teamId', code: 'MISSING_PARAM' })
    }
    // 校验是否是队长
    const team = await RoundTeam.findOne({ id: teamId, roundId })
    if (!team) {
      return res.status(404).json({ success: false, error: '队伍不存在', code: 'TEAM_NOT_FOUND' })
    }
    if (team.captainId !== req.user.userId) {
      return res.status(403).json({ success: false, error: '只有队长才能抢选歌曲', code: 'NOT_CAPTAIN' })
    }
    // 校验歌曲
    const roundSong = await RoundSong.findOne({ id: roundSongId, roundId })
    if (!roundSong) {
      return res.status(404).json({ success: false, error: '歌曲不存在', code: 'SONG_NOT_FOUND' })
    }
    if (!roundSong.released) {
      return res.status(400).json({ success: false, error: '该歌曲尚未释放', code: 'SONG_NOT_RELEASED' })
    }
    if (roundSong.assignedTeamId) {
      return res.status(409).json({ success: false, error: '该歌曲已被其他队伍抢选', code: 'SONG_ALREADY_CLAIMED' })
    }
    // 校验队伍是否已选歌
    const existingTeamSong = await TeamSong.findOne({ roundId, teamId })
    if (existingTeamSong) {
      return res.status(400).json({ success: false, error: '你的队伍已经选过歌了', code: 'TEAM_ALREADY_HAS_SONG' })
    }
    // 原子操作：更新 RoundSong + 插入 TeamSong
    roundSong.assignedTeamId = teamId
    roundSong.updatedAt = new Date().toISOString()
    await roundSong.save()
    const teamSong = new TeamSong({
      id: generateId(), roundId, roundIndex: roundSong.roundIndex,
      teamId, songId: roundSong.songId, assignedBy: req.user.userId,
      createdAt: new Date().toISOString()
    })
    await teamSong.save()
    logAction(req.user.userId, req.user.name || 'captain', 'captain', ACTION_TYPES.TEAM_SONG_ASSIGN, 'roundSong', roundSongId, `队长抢选歌曲`)
    res.json({ success: true, data: { teamSong: teamSong.toObject() } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '抢选歌曲失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/songs/admin-assign - 管理员直接分配 =====
router.post('/admin-assign', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, roundSongId, teamId } = req.body
    if (!roundId || !roundSongId || !teamId) {
      return res.status(400).json({ success: false, error: '缺少 roundId、roundSongId 或 teamId', code: 'MISSING_PARAM' })
    }
    const roundSong = await RoundSong.findOne({ id: roundSongId, roundId })
    if (!roundSong) {
      return res.status(404).json({ success: false, error: '歌曲不存在', code: 'SONG_NOT_FOUND' })
    }
    if (!roundSong.released) {
      return res.status(400).json({ success: false, error: '该歌曲尚未释放', code: 'SONG_NOT_RELEASED' })
    }
    if (roundSong.assignedTeamId) {
      return res.status(400).json({ success: false, error: '该歌曲已被分配', code: 'SONG_ALREADY_ASSIGNED' })
    }
    // 校验队伍是否已选歌
    const existingTeamSong = await TeamSong.findOne({ roundId, teamId })
    if (existingTeamSong) {
      return res.status(400).json({ success: false, error: '该队伍已经选过歌了', code: 'TEAM_ALREADY_HAS_SONG' })
    }
    // 更新 RoundSong + 插入 TeamSong
    roundSong.assignedTeamId = teamId
    roundSong.updatedAt = new Date().toISOString()
    await roundSong.save()
    const teamSong = new TeamSong({
      id: generateId(), roundId, roundIndex: roundSong.roundIndex,
      teamId, songId: roundSong.songId, assignedBy: req.user.userId,
      createdAt: new Date().toISOString()
    })
    await teamSong.save()
    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TEAM_SONG_ASSIGN, 'roundSong', roundSongId, '管理员分配歌曲')
    res.json({ success: true, data: { teamSong: teamSong.toObject() } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '分配歌曲失败', code: 'SERVER_ERROR' })
  }
})

// 随机产生一首歌曲
router.get('/random', auth, requireAdmin, async (req, res) => {
  try {
    const path = require('path')
    const songLibraryPath = path.join(__dirname, '..', 'data', 'songLibrary.json')
    const songLibrary = require(songLibraryPath)
    const { generateRandomSong } = require('../utils/randomSong')

    if (!songLibrary || songLibrary.length === 0) {
      return res.status(500).json({ success: false, error: '歌曲库为空', code: 'EMPTY_LIBRARY' })
    }

    // 获取数据库中已有的歌名集合（用于去重提示，但不阻止）
    const existingSongs = await Song.find({})
    const existingNames = new Set(existingSongs.map(s => s.name))

    // 随机选取一首歌曲
    let songInfo, attempts = 0, maxAttempts = 100
    do {
      const randomIndex = Math.floor(Math.random() * songLibrary.length)
      songInfo = songLibrary[randomIndex]
      attempts++
    } while (songInfo && existingNames.has(songInfo.title) && attempts < maxAttempts)

    // 如果循环结束后 songInfo 为 undefined，直接随机选一首
    if (!songInfo) {
      const randomIndex = Math.floor(Math.random() * songLibrary.length)
      songInfo = songLibrary[randomIndex]
    }

    // 生成游戏属性
    const songData = generateRandomSong(songInfo)

    // 保存到数据库
    const song = new Song({
      id: generateId(),
      ...songData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    await song.save()

    const isDuplicate = existingNames.has(songInfo.title)
    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.SONG_CREATE, 'song', song.id, `随机产生歌曲: ${songData.name}`)

    res.json({
      success: true,
      data: song.toObject(),
      message: isDuplicate ? `歌曲"${songData.name}"已存在，但已重新生成属性并保存` : `成功随机产生歌曲: ${songData.name}`
    })
  } catch (e) {
    console.error('随机产生歌曲失败:', e)
    res.status(500).json({ success: false, error: '随机产生歌曲失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
