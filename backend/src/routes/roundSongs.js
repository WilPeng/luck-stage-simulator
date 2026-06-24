const express = require('express')
const router = express.Router()
const { v4: generateId } = require('uuid')
const { auth } = require('../middleware/auth')
const { requireAdmin } = require('../middleware/auth')
const RoundSong = require('../models/RoundSong')
const Song = require('../models/Song')
const SongAssignment = require('../models/SongAssignment')

// 允许的歌曲类型
const VALID_SONG_TYPES = ['team_show', 'team_collab', 'captain_show', 'pk_show']
// 允许的给分方式
const VALID_SCORING_METHODS = ['actual', 'fixed', 'ranked']

// 批量添加歌曲到本轮
router.post('/batch', auth, requireAdmin, async (req, res) => {
  try {
    const { round, songs } = req.body

    if (!round) {
      return res.status(400).json({ success: false, error: 'round 为必填', code: 'MISSING_PARAMS' })
    }

    if (!Array.isArray(songs) || songs.length === 0) {
      return res.status(400).json({ success: false, error: 'songs 列表不能为空', code: 'MISSING_PARAMS' })
    }

    const r = parseInt(round)
    const created = []

    for (const item of songs) {
      if (!item.songId) continue

      const song = await Song.findOne({ id: item.songId })
      if (!song) continue

      // 校验歌曲类型
      const songType = VALID_SONG_TYPES.includes(item.songType) ? item.songType : (song.type || 'pk_show')
      // 校验给分方式
      let scoringMethod = null
      if (item.scoringMethod && VALID_SCORING_METHODS.includes(item.scoringMethod)) {
        scoringMethod = item.scoringMethod
      }
      // team_show / team_collab 默认 actual
      if (!scoringMethod && (songType === 'team_show' || songType === 'team_collab')) {
        scoringMethod = 'actual'
      }

      // 检查是否已存在（同一轮 + 同一歌曲）
      const existing = await RoundSong.find({ round: r, songId: item.songId })
      if (existing.length > 0) continue

      const roundSong = new RoundSong({
        id: generateId(),
        round: r,
        songId: item.songId,
        songType,
        scoringMethod,
        createdAt: new Date().toISOString()
      })
      await roundSong.save()

      created.push({
        id: roundSong.id,
        round: r,
        songId: item.songId,
        songType,
        scoringMethod,
        createdAt: roundSong.createdAt,
        song
      })
    }

    res.status(201).json({ success: true, data: { count: created.length, list: created } })
  } catch (error) {
    console.error('Batch add round songs error:', error)
    res.status(500).json({ success: false, error: '批量添加轮次歌曲失败', code: 'SERVER_ERROR' })
  }
})

// 获取本轮所有歌曲
router.get('/:round', auth, async (req, res) => {
  try {
    const r = parseInt(req.params.round)

    const roundSongs = await RoundSong.find({ round: r })

    const data = []
    for (const rs of roundSongs) {
      const song = await Song.findOne({ id: rs.songId })
      const o = rs.toObject ? rs.toObject() : rs
      data.push({
        ...o,
        song: song ? {
          id: song.id,
          name: song.name,
          type: song.type,
          style: song.style,
          difficulty: song.difficulty,
          vocalWeight: song.vocalWeight,
          danceWeight: song.danceWeight,
          charmWeight: song.charmWeight,
          baseScore: song.baseScore,
          riskFactor: song.riskFactor
        } : null
      })
    }

    res.json({ success: true, data })
  } catch (error) {
    console.error('Get round songs error:', error)
    res.status(500).json({ success: false, error: '获取轮次歌曲失败', code: 'SERVER_ERROR' })
  }
})

// 获取本轮所有歌曲（含分配信息）
router.get('/:round/full', auth, async (req, res) => {
  try {
    const r = parseInt(req.params.round)

    const roundSongs = await RoundSong.find({ round: r })

    const data = []
    for (const rs of roundSongs) {
      const song = await Song.findOne({ id: rs.songId })
      // 查询对应的分配记录
      const assignments = await SongAssignment.find({ round: r, songId: rs.songId })

      const o = rs.toObject ? rs.toObject() : rs
      data.push({
        ...o,
        song: song || null,
        assignments: assignments.map(a => {
          const ao = a.toObject ? a.toObject() : a
          return ao
        })
      })
    }

    res.json({ success: true, data })
  } catch (error) {
    console.error('Get round songs full error:', error)
    res.status(500).json({ success: false, error: '获取轮次歌曲（含分配）失败', code: 'SERVER_ERROR' })
  }
})

// 移除轮次歌曲
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const roundSong = await RoundSong.findOne({ id })
    if (!roundSong) {
      return res.status(404).json({ success: false, error: '轮次歌曲不存在', code: 'NOT_FOUND' })
    }

    // 同时删除对应的歌曲分配
    await SongAssignment.deleteMany({ round: roundSong.round, songId: roundSong.songId })
    await RoundSong.deleteMany({ id })

    res.json({ success: true, data: { id } })
  } catch (error) {
    console.error('Remove round song error:', error)
    res.status(500).json({ success: false, error: '移除轮次歌曲失败', code: 'SERVER_ERROR' })
  }
})

// 更新给分方式
router.put('/:id/scoring', auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { scoringMethod } = req.body

    if (!scoringMethod || !VALID_SCORING_METHODS.includes(scoringMethod)) {
      return res.status(400).json({
        success: false,
        error: `scoringMethod 必须为 ${VALID_SCORING_METHODS.join(' | ')} 之一`,
        code: 'INVALID_SCORING_METHOD'
      })
    }

    const roundSong = await RoundSong.findOne({ id })
    if (!roundSong) {
      return res.status(404).json({ success: false, error: '轮次歌曲不存在', code: 'NOT_FOUND' })
    }

    roundSong.scoringMethod = scoringMethod
    await roundSong.save()

    const o = roundSong.toObject ? roundSong.toObject() : roundSong
    res.json({ success: true, data: o })
  } catch (error) {
    console.error('Update scoring method error:', error)
    res.status(500).json({ success: false, error: '更新给分方式失败', code: 'SERVER_ERROR' })
  }
})

// 清空本轮所有歌曲
router.delete('/clear/:round', auth, requireAdmin, async (req, res) => {
  try {
    const r = parseInt(req.params.round)

    // 先删除对应的歌曲分配
    await SongAssignment.deleteMany({ round: r })
    // 再删除轮次歌曲
    await RoundSong.deleteMany({ round: r })

    res.json({ success: true, data: { message: `第 ${r} 轮所有歌曲及分配已清空` } })
  } catch (error) {
    console.error('Clear round songs error:', error)
    res.status(500).json({ success: false, error: '清空轮次歌曲失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
