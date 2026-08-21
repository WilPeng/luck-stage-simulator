const express = require('express')
const { auth, requireAdmin } = require('../middleware/auth')
const { logAction, getCurrentSeason, ACTION_TYPES } = require('../utils/helpers')
const Season = require('../models/Season')
const Round = require('../models/Round')
const User = require('../models/User')
const RoundTeam = require('../models/RoundTeam')
const RoundTeamMember = require('../models/RoundTeamMember')
const TeamSong = require('../models/TeamSong')
const TrainingRecord = require('../models/TrainingRecord')

const router = express.Router()

async function getRound(roundId) {
  if (roundId) {
    const byId = await Round.findOne({ id: roundId })
    if (byId) return byId
    const match = typeof roundId === 'string' ? roundId.match(/^round[_-](\d+)$/) : null
    if (match) {
      const season = await getCurrentSeason()
      const query = { index: parseInt(match[1]) }
      if (season) query.seasonId = season.id
      const byIndex = await Round.findOne(query)
      if (byIndex) return byIndex
    }
  }
  const season = await getCurrentSeason()
  if (!season) return null
  return await Round.findOne({ seasonId: season.id, index: season.currentRound })
}

async function resolveRoundIds(roundId) {
  const round = await getRound(roundId)
  if (!round) return null
  return {
    round,
    dbRoundId: round.id,
    frontRoundId: `round-${round.index}`
  }
}

function getRoundFilter(r) {
  const front = `round-${r.index}`
  return { $in: [r.id, front] }
}

const RELEASE_ACTIONS = ['team', 'song', 'training', 'performance']

/**
 * 推断并发阶段各项行动的完成状态，并带上释放开关
 */
async function getConcurrentStatus(roundInfo) {
  const { round, frontRoundId } = roundInfo
  const roundFilter = getRoundFilter(round)

  const season = await getCurrentSeason()
  const drawsPerPlayer = (season && season.trainingDrawsPerPlayer) || 3

  const [teams, members, teamSongs, trainingRecords, users] = await Promise.all([
    RoundTeam.find({ roundId: roundFilter }),
    RoundTeamMember.find({ roundId: roundFilter }),
    TeamSong.find({ roundId: roundFilter }),
    TrainingRecord.find({ roundId: roundFilter }),
    User.find({ role: { $ne: 'admin' }, status: 'active' })
  ])

  const membersByTeam = {}
  for (const m of members) {
    membersByTeam[m.teamId] = membersByTeam[m.teamId] || []
    membersByTeam[m.teamId].push(m)
  }

  const teamSongMap = {}
  for (const ts of teamSongs) teamSongMap[ts.teamId] = ts

  const trainingCountByPlayer = {}
  for (const r of trainingRecords) {
    trainingCountByPlayer[r.playerId] = (trainingCountByPlayer[r.playerId] || 0) + 1
  }

  const teamCompletedCount = teams.filter(t => (membersByTeam[t.id] || []).length > 0).length
  const songCompletedCount = teams.filter(t => !!teamSongMap[t.id]).length
  // 训练：只要开始训练过 1 次（本次公演训练次数 > 0）即视为已参与训练环节
  const trainingCompletedCount = users.filter(u => (trainingCountByPlayer[u.id] || 0) > 0).length

  const allTeamCompleted = teams.length > 0 && teamCompletedCount === teams.length
  const allSongCompleted = teams.length > 0 && songCompletedCount === teams.length
  const allTrainingCompleted = users.length > 0 && trainingCompletedCount === users.length

  return {
    roundId: frontRoundId,
    roundIndex: round.index,
    drawsPerPlayer,
    teamReleased: !!round.teamReleased,
    songReleased: !!round.songReleased,
    trainingReleased: !!round.trainingReleased,
    performanceReleased: !!round.performanceReleased,
    summary: {
      totalTeams: teams.length,
      teamCompleted: teamCompletedCount,
      songCompleted: songCompletedCount,
      totalPlayers: users.length,
      trainingCompleted: trainingCompletedCount,
      allCompleted: allTeamCompleted && allSongCompleted && allTrainingCompleted
    }
  }
}

// ===== GET /api/concurrent/release-status =====
router.get('/release-status', auth, async (req, res) => {
  try {
    const { roundId, roundIndex } = req.query
    const roundInfo = await resolveRoundIds(roundId || (roundIndex ? `round-${roundIndex}` : null))
    if (!roundInfo) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })

    const { round } = roundInfo
    res.json({
      success: true,
      data: {
        roundId: `round-${round.index}`,
        roundIndex: round.index,
        teamReleased: !!round.teamReleased,
        songReleased: !!round.songReleased,
        trainingReleased: !!round.trainingReleased,
        performanceReleased: !!round.performanceReleased
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取释放状态失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/concurrent/status =====
router.get('/status', auth, async (req, res) => {
  try {
    const { roundId, roundIndex } = req.query
    const roundInfo = await resolveRoundIds(roundId || (roundIndex ? `round-${roundIndex}` : null))
    if (!roundInfo) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })

    const status = await getConcurrentStatus(roundInfo)
    res.json({ success: true, data: status })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取并发状态失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/concurrent/release =====
router.post('/release', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, action, released } = req.body
    if (!roundId || !action || typeof released !== 'boolean') {
      return res.status(400).json({ success: false, error: 'roundId/action/released 必填', code: 'MISSING_PARAM' })
    }
    if (!RELEASE_ACTIONS.includes(action)) {
      return res.status(400).json({ success: false, error: '无效 action', code: 'INVALID_ACTION' })
    }

    const roundInfo = await resolveRoundIds(roundId)
    if (!roundInfo) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })

    const { round, frontRoundId } = roundInfo
    const roundFilter = getRoundFilter(round)

    switch (action) {
      case 'team':
        round.teamReleased = released
        // 开放组队时顺带解锁该轮所有队伍；关闭时保持原样（由管理员在队伍页单独控制）
        if (released) {
          const lockedTeams = await RoundTeam.find({ roundId: roundFilter, locked: true })
          for (const t of lockedTeams) {
            t.locked = false
            t.updatedAt = new Date().toISOString()
            await t.save()
          }
        }
        break
      case 'song':
        // 仅控制选歌环节开关；单首歌曲的释放由管理员在歌曲管理页单独操作（POST /songs/release）
        round.songReleased = released
        break
      case 'training':
        round.trainingReleased = released
        break
      case 'performance':
        round.performanceReleased = released
        break
    }

    round.updatedAt = new Date().toISOString()
    await round.save()

    const status = await getConcurrentStatus(roundInfo)

    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.SONG_LIBRARY_EDIT, 'concurrent', round.id,
      `${released ? '开放' : '关闭'}并发行动: ${action}`)

    res.json({ success: true, data: status })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置释放状态失败: ' + (e.message || '未知错误'), code: 'SERVER_ERROR' })
  }
})

module.exports = router
