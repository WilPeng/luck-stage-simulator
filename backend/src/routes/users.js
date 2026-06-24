const express = require('express')
const router = express.Router()
const User = require('../models/User')
const Team = require('../models/Team')
const { auth, requireAdmin } = require('../middleware/auth')
const { generateId, logAction } = require('../utils/helpers')
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
    const allowed = /^image\/(png|jpeg|jpg|gif|webp|bmp)$/i
    if (allowed.test(file.mimetype)) return cb(null, true)
    cb(new Error('只能上传图片文件 (jpg/png/gif/webp/bmp)'))
  }
})

router.get('/', auth, async (req, res) => {
  try {
    const { keyword, role, status, teamId, page, pageSize, simple } = req.query

    const filter = {}
    if (keyword) filter.keyword = keyword
    if (role) filter.role = role
    if (status) filter.status = status
    if (teamId) filter.teamId = teamId
    if (page) filter.page = page
    if (pageSize) filter.pageSize = pageSize

    const result = await User.search(filter)
    const listData = result.list.map(u => {
      const obj = u.toObject()
      delete obj._id
      return obj
    })

    res.json({
      success: true,
      data: {
        list: listData,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages
      }
    })
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ success: false, error: '获取用户列表失败', code: 'SERVER_ERROR' })
  }
})

router.get('/stats', auth, requireAdmin, async (req, res) => {
  try {
    const stats = await User.stats()
    res.json({ success: true, data: stats })
  } catch (error) {
    console.error('Get user stats error:', error)
    res.status(500).json({ success: false, error: '获取用户统计失败', code: 'SERVER_ERROR' })
  }
})

router.get('/:id', auth, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.params.id })
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在', code: 'USER_NOT_FOUND' })
    }
    const userObj = user.toObject()
    delete userObj._id
    res.json({ success: true, data: userObj })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ success: false, error: '获取用户信息失败', code: 'SERVER_ERROR' })
  }
})

router.post('/', auth, requireAdmin, async (req, res) => {
  try {
    const { name, loginCode, role, status, teamId, attributes, trainingCount, avatar } = req.body

    if (!name || !loginCode) {
      return res.status(400).json({ success: false, error: '姓名和登录码不能为空', code: 'MISSING_PARAMS' })
    }

    const existingByCode = await User.findOne({ loginCode })
    if (existingByCode) {
      return res.status(400).json({ success: false, error: '登录码已存在', code: 'LOGIN_CODE_EXISTS' })
    }

    const user = new User({
      id: generateId(),
      name,
      loginCode,
      role: role || 'player',
      status: status || 'active',
      teamId: teamId || null,
      avatar: avatar || null,
      hasLogin: false,
      attributes: {
        vocal: attributes && attributes.vocal !== undefined ? attributes.vocal : 30,
        dance: attributes && attributes.dance !== undefined ? attributes.dance : 30,
        charm: attributes && attributes.charm !== undefined ? attributes.charm : 30
      },
      trainingCount: trainingCount !== undefined ? trainingCount : 0
    })

    await user.save()

    if (user.teamId) {
      const team = await Team.findOne({ id: user.teamId })
      if (team) {
        if (!team.memberIds.includes(user.id)) {
          team.memberIds.push(user.id)
          await team.save()
        }
      }
    }

    await logAction(req.user.userId, req.user.name, req.user.role, 'create_user', 'user', user.id, `创建用户 ${name} (${loginCode})`)

    const userObj = user.toObject()
    delete userObj._id

    res.status(201).json({ success: true, data: userObj })
  } catch (error) {
    console.error('Create user error:', error)
    res.status(500).json({ success: false, error: '创建用户失败', code: 'SERVER_ERROR' })
  }
})

router.post('/batch', auth, requireAdmin, async (req, res) => {
  try {
    const { users } = req.body

    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ success: false, error: '用户列表不能为空', code: 'MISSING_PARAMS' })
    }

    const created = []
    const errors = []

    for (let i = 0; i < users.length; i++) {
      const userData = users[i]
      try {
        if (!userData.name || !userData.loginCode) {
          errors.push({ index: i, error: '姓名和登录码不能为空' })
          continue
        }

        const existingByCode = await User.findOne({ loginCode: userData.loginCode })
        if (existingByCode) {
          errors.push({ index: i, loginCode: userData.loginCode, error: '登录码已存在' })
          continue
        }

        const user = new User({
          id: generateId(),
          name: userData.name,
          loginCode: userData.loginCode,
          role: userData.role || 'player',
          status: userData.status || 'active',
          teamId: userData.teamId || null,
          hasLogin: false,
          attributes: {
            vocal: userData.attributes && userData.attributes.vocal !== undefined ? userData.attributes.vocal : 30,
            dance: userData.attributes && userData.attributes.dance !== undefined ? userData.attributes.dance : 30,
            charm: userData.attributes && userData.attributes.charm !== undefined ? userData.attributes.charm : 30
          },
          trainingCount: userData.trainingCount !== undefined ? userData.trainingCount : 0
        })

        await user.save()

        if (user.teamId) {
          const team = await Team.findOne({ id: user.teamId })
          if (team) {
            if (!team.memberIds.includes(user.id)) {
              team.memberIds.push(user.id)
              await team.save()
            }
          }
        }

        created.push(user)
      } catch (err) {
        errors.push({ index: i, error: err.message })
      }
    }

    await logAction(req.user.userId, req.user.name, req.user.role, 'batch_create_user', 'user', 'batch', `批量创建 ${created.length} 个用户`)

    res.json({
      success: true,
      data: {
        created: created.map(u => {
          const obj = u.toObject()
          delete obj._id
          return obj
        }),
        errors,
        successCount: created.length,
        errorCount: errors.length
      }
    })
  } catch (error) {
    console.error('Batch create users error:', error)
    res.status(500).json({ success: false, error: '批量创建用户失败', code: 'SERVER_ERROR' })
  }
})

router.put('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.params.id })
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在', code: 'USER_NOT_FOUND' })
    }

    const { name, loginCode, role, status, teamId, hasLogin, attributes, trainingCount, avatar } = req.body

    if (loginCode && loginCode !== user.loginCode) {
      const existingByCode = await User.findOne({ loginCode })
      if (existingByCode) {
        return res.status(400).json({ success: false, error: '登录码已存在', code: 'LOGIN_CODE_EXISTS' })
      }
    }

    const oldTeamId = user.teamId

    if (name !== undefined) user.name = name
    if (loginCode !== undefined) user.loginCode = loginCode
    if (role !== undefined) user.role = role
    if (status !== undefined) user.status = status
    if (teamId !== undefined) user.teamId = teamId
    if (hasLogin !== undefined) user.hasLogin = hasLogin
    if (avatar !== undefined) user.avatar = avatar
    if (attributes !== undefined) {
      if (attributes.vocal !== undefined) user.attributes.vocal = attributes.vocal
      if (attributes.dance !== undefined) user.attributes.dance = attributes.dance
      if (attributes.charm !== undefined) user.attributes.charm = attributes.charm
    }
    if (trainingCount !== undefined) user.trainingCount = trainingCount

    await user.save()

    if (teamId !== undefined && teamId !== oldTeamId) {
      if (oldTeamId) {
        const oldTeam = await Team.findOne({ id: oldTeamId })
        if (oldTeam) {
          oldTeam.memberIds = oldTeam.memberIds.filter(id => id !== user.id)
          await oldTeam.save()
        }
      }

      if (teamId) {
        const newTeam = await Team.findOne({ id: teamId })
        if (newTeam) {
          if (!newTeam.memberIds.includes(user.id)) {
            newTeam.memberIds.push(user.id)
            await newTeam.save()
          }
        }
      }
    }

    await logAction(req.user.userId, req.user.name, req.user.role, 'update_user', 'user', user.id, `更新用户 ${user.name} 信息`)

    const userObj = user.toObject()
    delete userObj._id

    res.json({ success: true, data: userObj })
  } catch (error) {
    console.error('Update user error:', error)
    res.status(500).json({ success: false, error: '更新用户信息失败', code: 'SERVER_ERROR' })
  }
})

router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.params.id })
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在', code: 'USER_NOT_FOUND' })
    }

    if (user.role === 'admin') {
      return res.status(400).json({ success: false, error: '不能删除管理员账户', code: 'CANNOT_DELETE_ADMIN' })
    }

    const teamId = user.teamId

    await User.deleteOne({ id: req.params.id })

    if (teamId) {
      const team = await Team.findOne({ id: teamId })
      if (team) {
        team.memberIds = team.memberIds.filter(id => id !== user.id)
        if (team.captainId === user.id) {
          team.captainId = team.memberIds.length > 0 ? team.memberIds[0] : null
        }
        await team.save()
      }
    }

    await logAction(req.user.userId, req.user.name, req.user.role, 'delete_user', 'user', user.id, `删除用户 ${user.name}`)

    res.json({ success: true, data: null, message: '用户删除成功' })
  } catch (error) {
    console.error('Delete user error:', error)
    res.status(500).json({ success: false, error: '删除用户失败', code: 'SERVER_ERROR' })
  }
})

router.post('/batch-delete', auth, requireAdmin, async (req, res) => {
  try {
    const { userIds } = req.body

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, error: '用户ID列表不能为空', code: 'MISSING_PARAMS' })
    }

    let deletedCount = 0
    const errors = []

    for (const userId of userIds) {
      try {
        const user = await User.findOne({ id: userId })
        if (!user) {
          errors.push({ id: userId, error: '用户不存在' })
          continue
        }

        if (user.role === 'admin') {
          errors.push({ id: userId, error: '不能删除管理员账户' })
          continue
        }

        const teamId = user.teamId
        await User.deleteOne({ id: userId })

        if (teamId) {
          const team = await Team.findOne({ id: teamId })
          if (team) {
            team.memberIds = team.memberIds.filter(id => id !== user.id)
            if (team.captainId === user.id) {
              team.captainId = team.memberIds.length > 0 ? team.memberIds[0] : null
            }
            await team.save()
          }
        }

        deletedCount++
      } catch (err) {
        errors.push({ id: userId, error: err.message })
      }
    }

    await logAction(req.user.userId, req.user.name, req.user.role, 'batch_delete_user', 'user', 'batch', `批量删除 ${deletedCount} 个用户`)

    res.json({
      success: true,
      data: {
        deletedCount,
        errorCount: errors.length,
        errors
      }
    })
  } catch (error) {
    console.error('Batch delete users error:', error)
    res.status(500).json({ success: false, error: '批量删除用户失败', code: 'SERVER_ERROR' })
  }
})

router.put('/:id/status', auth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.params.id })
    if (!user) {
      return res.status(404).json({ success: false, error: '用户不存在', code: 'USER_NOT_FOUND' })
    }

    const { status } = req.body

    if (!['active', 'danger', 'eliminated'].includes(status)) {
      return res.status(400).json({ success: false, error: '无效的状态值', code: 'INVALID_STATUS' })
    }

    user.status = status
    await user.save()

    await logAction(req.user.userId, req.user.name, req.user.role, 'update_user_status', 'user', user.id, `更新用户 ${user.name} 状态为 ${status}`)

    const userObj = user.toObject()
    delete userObj._id

    res.json({ success: true, data: userObj })
  } catch (error) {
    console.error('Update user status error:', error)
    res.status(500).json({ success: false, error: '更新用户状态失败', code: 'SERVER_ERROR' })
  }
})

// 选手上传自己的头像（无需管理员权限，登录即可）
router.post('/me/avatar', auth, upload.single('avatar'), async (req, res) => {
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

// 选手删除自己的头像（无需管理员权限，登录即可）
router.delete('/me/avatar', auth, async (req, res) => {
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

// 管理员头像上传接口（保留，供管理员使用）
router.post('/:id/avatar', auth, requireAdmin, upload.single('avatar'), async (req, res) => {
  try {
    const user = await User.findOne({ id: req.params.id })
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
        userId: user.id,
        user: { ...user.toObject(), _id: undefined }
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

// 删除用户头像
router.delete('/:id/avatar', auth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.params.id })
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

    await logAction(req.user.userId, req.user.name, req.user.role, 'delete_avatar', 'user', user.id, `删除用户 ${user.name} 头像`)

    res.json({ success: true, data: null, message: '头像删除成功' })
  } catch (error) {
    console.error('Delete avatar error:', error)
    res.status(500).json({ success: false, error: '删除头像失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
