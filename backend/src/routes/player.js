const express = require('express')
const router = express.Router()
const { auth } = require('../middleware/auth')
const { getCurrentSeason, generateId, logAction } = require('../utils/helpers')
const Round = require('../models/Round')
const TeamPerformance = require('../models/TeamPerformance')
const PlayerPerformance = require('../models/PlayerPerformance')
const User = require('../models/User')
const multer = require('multer')
const path = require('path')
const fs = require('fs')

// multer 头像上传配置
const avatarDir = path.join(__dirname, '..', '..', 'uploads', 'avatars')
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png'
    cb(null, `avatar-${Date.now()}-${generateId()}${ext}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) return cb(null, true)
    cb(new Error('只能上传图片文件（jpg/jpeg/png/gif/webp）'))
  }
})

/**
 * 解析查询参数中的轮次信息
 */
async function resolveRoundFromQuery(req) {
  const { roundId, roundIndex, round } = req.query
  const qRoundIdx = parseInt(roundIndex ?? round)
  if (roundId) {
    const r = await Round.findOne({ id: roundId })
    if (r) return r
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
    // 尝试解析纯数字 roundId
    const num = parseInt(roundId)
    if (!isNaN(num) && num > 0) {
      const season = await getCurrentSeason()
      if (season) {
        let r2 = await Round.findOne({ seasonId: season.id, index: num })
        if (r2) return r2
        r2 = await Round.findOne({ seasonId: season.id, roundIndex: num })
        if (r2) { r2.index = num; await r2.save(); return r2 }
      }
      return { id: `round-${num}`, index: num, stage: 'performance' }
    }
  }
  if (!isNaN(qRoundIdx)) {
    const season = await getCurrentSeason()
    if (season) {
      let r = await Round.findOne({ seasonId: season.id, index: qRoundIdx })
      if (r) return r
      r = await Round.findOne({ seasonId: season.id, roundIndex: qRoundIdx })
      if (r) { r.index = qRoundIdx; await r.save(); return r }
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

function buildRoundFilter(round) {
  const filter = {}
  if (!round) return filter
  if (round.id) filter.roundId = round.id
  if (typeof round.index === 'number') filter.roundIndex = round.index
  return filter
}

// ===== GET /api/player/performance/result - 选手端公演结果 =====
router.get('/performance/result', auth, async (req, res) => {
  try {
    const playerId = req.user.userId
    const round = await resolveRoundFromQuery(req)
    if (!round) return res.status(400).json({ success: false, message: '请传 roundId 参数' })

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
    const teamPlayers = playerPerf.filter(p => p.teamId === myPerf.teamId)
      .sort((a, b) => (a.rankInTeam || 999) - (b.rankInTeam || 999))

    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    // 安全/危险判定
    const season = await getCurrentSeason()
    const roundCfg = await Round.findOne({ id: filter.roundId })
    const dangerRatio = roundCfg?.dangerLineRatio ?? 0.2
    const dangerCount = Math.max(0, Math.ceil(teamPerf.length * dangerRatio))
    const safeTeamIds = new Set(teamPerf.slice(0, teamPerf.length - dangerCount).map(t => t.teamId))
    const isSafe = safeTeamIds.has(myPerf.teamId)

    // 舞台评价
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
          songVocalWeight: myTeam.songVocalWeight,
          songDanceWeight: myTeam.songDanceWeight,
          songCharmWeight: myTeam.songCharmWeight,
          baseVotes: myTeam.baseVotes,
          attributeVotes: myTeam.attributeVotes,
          performanceVotes: myTeam.performanceVotes,
          compatibilityVotes: myTeam.compatibilityVotes,
          eventVotes: myTeam.eventVotes,
          eventName: myTeam.eventName,
          eventDescription: myTeam.eventDescription
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
    console.error('Get player performance result error:', e)
    res.status(500).json({ success: false, message: '获取公演结果失败' })
  }
})

// ===== POST /api/player/avatar - 选手上传自己的头像 =====
router.post('/avatar', auth, upload.single('avatar'), async (req, res) => {
  try {
    const user = await User.findOne({ id: req.user.userId })
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在', code: 'USER_NOT_FOUND' })
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: '未上传图片文件', code: 'MISSING_FILE' })
    }

    const oldAvatar = user.avatar
    const avatarUrl = `/uploads/avatars/${req.file.filename}`
    user.avatar = avatarUrl
    await user.save()

    // 清理旧的头像文件
    if (oldAvatar && oldAvatar.startsWith('/uploads/avatars/')) {
      const oldPath = path.join(__dirname, '..', '..', oldAvatar)
      if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {})
    }

    await logAction(req.user.userId, req.user.name, req.user.role, 'upload_avatar', 'user', user.id, `用户 ${user.name} 上传头像`)

    res.json({
      success: true,
      data: {
        avatar: avatarUrl,
        userId: user.id
      }
    })
  } catch (error) {
    console.error('Upload avatar error:', error)
    if (error.message && error.message.includes('只能上传图片')) {
      return res.status(400).json({ success: false, error: error.message, code: 'INVALID_FILE_TYPE' })
    }
    res.status(500).json({ success: false, error: '上传头像失败', code: 'SERVER_ERROR' })
  }
})

// ===== DELETE /api/player/avatar - 选手删除自己的头像 =====
router.delete('/avatar', auth, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.user.userId })
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在', code: 'USER_NOT_FOUND' })
    }

    if (!user.avatar) {
      return res.json({ success: true, data: null, message: '该用户无头像' })
    }

    const oldAvatar = user.avatar
    user.avatar = null
    await user.save()

    if (oldAvatar && oldAvatar.startsWith('/uploads/avatars/')) {
      const oldPath = path.join(__dirname, '..', '..', oldAvatar)
      if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {})
    }

    await logAction(req.user.userId, req.user.name, req.user.role, 'delete_avatar', 'user', user.id, `用户 ${user.name} 删除头像`)

    res.json({ success: true, data: null, message: '头像删除成功' })
  } catch (error) {
    console.error('Delete avatar error:', error)
    res.status(500).json({ success: false, error: '删除头像失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
