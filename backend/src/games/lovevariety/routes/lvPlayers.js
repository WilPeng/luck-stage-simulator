const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs')
const multer = require('multer')
const cloudinary = require('cloudinary').v2
const { CloudinaryStorage } = require('multer-storage-cloudinary')
const LVPlayer = require('../models/LVPlayer')
const { generateId, logAction, LV_ACTION_TYPES } = require('../helpers')

// Cloudinary 配置（优先使用云端存储，否则回退到本地）
let upload
let useCloudinary = false

if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  })

  const cloudStorage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'luck-stage/lvavatars',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      public_id: () => `lv-avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    }
  })

  upload = multer({
    storage: cloudStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) return cb(new Error('仅支持图片文件'))
      cb(null, true)
    }
  })
  useCloudinary = true
  console.log('[LVPlayers] 使用 Cloudinary 云端存储头像')
} else {
  // 本地文件存储（开发环境 fallback）
  const AVATAR_DIR = path.join(__dirname, '..', '..', '..', '..', 'uploads', 'lvavatars')
  if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true })

  const localStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, AVATAR_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg'
      cb(null, `lv-avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
    }
  })
  upload = multer({
    storage: localStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) return cb(new Error('仅支持图片文件'))
      cb(null, true)
    }
  })
  console.log('[LVPlayers] 使用本地文件存储头像')
}

// GET / - 获取所有选手
router.get('/', async (req, res) => {
  try {
    const { keyword, status, page = '1', pageSize = '20' } = req.query
    const filter = { gameId: 'lovevariety' }
    if (keyword) {
      filter.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { loginCode: { $regex: keyword, $options: 'i' } },
      ]
    }
    if (status) filter.status = status
    const currentPage = Math.max(1, parseInt(page) || 1)
    const currentPageSize = Math.max(1, Math.min(100, parseInt(pageSize) || 20))
    const skip = (currentPage - 1) * currentPageSize
    const [documents, total] = await Promise.all([
      new LVPlayer()._getCollection().find(filter).skip(skip).limit(currentPageSize).toArray(),
      new LVPlayer()._getCollection().countDocuments(filter)
    ])
    const list = documents.map(d => new LVPlayer(d).toObject())
    res.json({
      success: true,
      data: {
        list,
        total,
        page: currentPage,
        pageSize: currentPageSize,
        totalPages: Math.ceil(total / currentPageSize)
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取选手列表失败', code: 'SERVER_ERROR' })
  }
})

// GET /active - 获取活跃选手（waiting 阶段返回空列表）
router.get('/active', async (req, res) => {
  try {
    const { getCurrentSeason } = require('../helpers')
    const season = await getCurrentSeason()
    // waiting 阶段不暴露选手信息
    if (season && season.currentStage === 'waiting') {
      return res.json({ success: true, data: [] })
    }
    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVPlayer')
    const docs = await col.find({ gameId: 'lovevariety', status: 'active', role: 'player' }).toArray()
    const list = docs.map(d => ({
      id: d.id, name: d.name, avatar: d.avatar || null, status: d.status,
      letterPublicCount: d.letterPublicCount ?? 0,
      letterAnonymousCount: d.letterAnonymousCount ?? 0,
      voteBudget: d.voteBudget ?? 0
    }))
    res.json({ success: true, data: list })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取活跃选手失败', code: 'SERVER_ERROR' })
  }
})

// ===== 头像备份与恢复 =====
// GET /avatars/download - 下载所有选手头像备份 ZIP
router.get('/avatars/download', async (req, res) => {
  try {
    const archiver = require('archiver')
    const https = require('https')
    const players = await new LVPlayer()._getCollection()
      .find({ gameId: 'lovevariety', avatar: { $ne: null, $ne: '' } })
      .toArray()

    if (players.length === 0) {
      return res.status(404).json({ success: false, error: '没有选手头像可供备份', code: 'NO_AVATARS' })
    }

    const archive = archiver('zip', { zlib: { level: 6 } })

    // 监听 archive 错误，防止未捕获异常
    archive.on('error', (err) => {
      console.error('[AvatarBackup] archive 错误:', err.message)
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: '打包头像失败', code: 'ARCHIVE_ERROR' })
      }
    })

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', 'attachment; filename="lv-avatars-backup.zip"')
    archive.pipe(res)

    let processedCount = 0
    const total = players.length
    const uploadsBase = path.resolve(__dirname, '..', '..', '..', '..')

    for (const player of players) {
      const avatar = player.avatar
      if (!avatar) continue

      try {
        let imageBuffer = null
        let ext = 'jpg'

        if (useCloudinary && avatar.includes('cloudinary')) {
          // 从 Cloudinary URL 下载
          const urlPath = new URL(avatar).pathname
          ext = path.extname(urlPath).replace('.', '') || 'jpg'
          imageBuffer = await new Promise((resolve, reject) => {
            https.get(avatar, (resp) => {
              if (resp.statusCode !== 200) {
                reject(new Error(`HTTP ${resp.statusCode}`))
                return
              }
              const chunks = []
              resp.on('data', (chunk) => chunks.push(chunk))
              resp.on('end', () => resolve(Buffer.concat(chunks)))
            }).on('error', (e) => reject(e))
          })
        } else if (typeof avatar === 'string' && avatar.startsWith('/uploads/')) {
          // 从本地文件系统读取
          const filePath = path.join(uploadsBase, avatar)
          if (fs.existsSync(filePath)) {
            ext = path.extname(avatar).replace('.', '') || 'jpg'
            imageBuffer = fs.readFileSync(filePath)
          }
        } else if (typeof avatar === 'string' && avatar.startsWith('http')) {
          // 其他 HTTP URL（可能是其他云存储）
          ext = path.extname(new URL(avatar).pathname).replace('.', '') || 'jpg'
          imageBuffer = await new Promise((resolve, reject) => {
            https.get(avatar, (resp) => {
              if (resp.statusCode !== 200) {
                reject(new Error(`HTTP ${resp.statusCode}`))
                return
              }
              const chunks = []
              resp.on('data', (chunk) => chunks.push(chunk))
              resp.on('end', () => resolve(Buffer.concat(chunks)))
            }).on('error', (e) => reject(e))
          })
        }

        if (imageBuffer) {
          archive.append(imageBuffer, { name: `${player.id}.${ext}` })
          processedCount++
        }
      } catch (err) {
        console.error(`[AvatarBackup] 下载头像失败 ${player.id}:`, err.message)
      }
    }

    archive.on('finish', () => {
      console.log(`[AvatarBackup] 备份完成: ${processedCount}/${total} 个头像已打包`)
    })

    archive.finalize()
  } catch (e) {
    console.error('[AvatarBackup] 备份失败:', e)
    console.error('[AvatarBackup] 堆栈:', e.stack)
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: '下载头像备份失败:' + e.message, code: 'SERVER_ERROR' })
    }
  }
})

// POST /avatars/restore - 上传 ZIP 恢复头像备份
const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/zip' && !file.originalname.endsWith('.zip')) {
      return cb(new Error('仅支持 ZIP 文件'))
    }
    cb(null, true)
  }
})

router.post('/avatars/restore', zipUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: '未上传 ZIP 文件', code: 'MISSING_FILE' })

    const unzipper = require('unzipper')
    const results = { success: 0, failed: 0, errors: [] }
    const directory = await unzipper.Open.buffer(req.file.buffer)

    for (const file of directory.files) {
      if (file.path.startsWith('__MACOSX') || file.path.startsWith('.')) continue
      if (!file.type || file.type === 'Directory') continue

      try {
        const parsedPath = path.parse(file.path)
        const playerId = parsedPath.name  // 文件名不含扩展名 = playerId
        const ext = parsedPath.ext.replace('.', '') || 'jpg'

        const player = await LVPlayer.findOne({ id: playerId, gameId: 'lovevariety' })
        if (!player) {
          results.failed++
          results.errors.push(`选手不存在: ${file.path}`)
          continue
        }

        const content = await file.buffer()

        if (useCloudinary) {
          // Cloudinary 模式：上传到 Cloudinary
          const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: 'luck-stage/lvavatars',
                public_id: `lv-avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                format: ext
              },
              (err, result) => {
                if (err) reject(err)
                else resolve(result)
              }
            )
            uploadStream.end(content)
          })
          player.avatar = result.secure_url
        } else {
          // 本地模式：保存到文件系统
          const fileName = `lv-avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
          const filePath = path.join(__dirname, '..', '..', '..', '..', 'uploads', 'lvavatars', fileName)
          fs.writeFileSync(filePath, content)
          player.avatar = `/uploads/lvavatars/${fileName}`
        }

        player.updatedAt = new Date().toISOString()
        await player.save()
        results.success++
      } catch (err) {
        results.failed++
        results.errors.push(`${file.path}: ${err.message}`)
      }
    }

    console.log(`[AvatarRestore] 恢复完成: ${results.success} 成功, ${results.failed} 失败`)
    res.json({ success: true, data: results })
  } catch (e) {
    console.error('[AvatarRestore] 恢复失败:', e)
    res.status(500).json({ success: false, error: '恢复头像失败', code: 'SERVER_ERROR' })
  }
})

// GET /stats - 选手统计
router.get('/stats', async (req, res) => {
  try {
    const stats = await LVPlayer.stats('lovevariety')
    res.json({ success: true, data: stats })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取统计失败', code: 'SERVER_ERROR' })
  }
})

// GET /:id - 获取单个选手
router.get('/:id', async (req, res) => {
  try {
    const player = await LVPlayer.findOne({ id: req.params.id, gameId: 'lovevariety' })
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })
    res.json({ success: true, data: player.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取选手失败', code: 'SERVER_ERROR' })
  }
})

// POST / - 创建选手
router.post('/', async (req, res) => {
  try {
    const { name, loginCode } = req.body
    if (!name) return res.status(400).json({ success: false, error: '姓名不能为空', code: 'INVALID_NAME' })
    const player = new LVPlayer({
      id: generateId(),
      name,
      loginCode: loginCode || `LV-${Date.now()}`,
      role: 'player',
      status: 'active',
      gameId: 'lovevariety'
    })
    await player.save()
    await logAction(req.user?.userId || 'system', req.user?.name || 'system', 'admin',
      LV_ACTION_TYPES.PLAYER_CREATE, 'player', player.id, `创建选手: ${player.name}`)
    res.json({ success: true, data: player.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '创建选手失败', code: 'SERVER_ERROR' })
  }
})

// PUT /:id - 更新选手
router.put('/:id', async (req, res) => {
  try {
    const player = await LVPlayer.findOne({ id: req.params.id, gameId: 'lovevariety' })
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })
    const { name, loginCode, status, avatar } = req.body
    if (name) player.name = name
    if (loginCode) player.loginCode = loginCode
    if (status) player.status = status
    if (avatar !== undefined) player.avatar = avatar
    player.updatedAt = new Date().toISOString()
    await player.save()
    await logAction(req.user?.userId || 'system', req.user?.name || 'system', 'admin',
      LV_ACTION_TYPES.PLAYER_EDIT, 'player', player.id, `更新选手: ${player.name} status=${player.status}`)
    res.json({ success: true, data: player.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '更新选手失败', code: 'SERVER_ERROR' })
  }
})

// DELETE /:id - 删除选手
router.delete('/:id', async (req, res) => {
  try {
    const player = await LVPlayer.findOne({ id: req.params.id, gameId: 'lovevariety' })
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })
    await LVPlayer.deleteOne({ id: req.params.id })
    await logAction(req.user?.userId || 'system', req.user?.name || 'system', 'admin',
      LV_ACTION_TYPES.PLAYER_DELETE, 'player', player.id, `删除选手: ${player.name}`)
    res.json({ success: true, data: null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '删除选手失败', code: 'SERVER_ERROR' })
  }
})

// POST /me/avatar - 选手自行上传头像（必须在 /:id/avatar 之前，避免被 /:id 匹配）
router.post('/me/avatar', upload.single('avatar'), async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    let player = await LVPlayer.findOne({ id: decoded.userId })
    // 降级查找：如果 token 中的 userId 找不到，尝试用请求体中的 playerId 查找
    if (!player && req.body.playerId) {
      player = await LVPlayer.findOne({ id: req.body.playerId })
    }
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })
    if (!req.file) return res.status(400).json({ success: false, error: '未上传图片文件', code: 'MISSING_FILE' })

    const oldAvatar = player.avatar
    // Cloudinary 返回完整 URL，本地返回相对路径
    const avatarUrl = useCloudinary ? req.file.path : `/uploads/lvavatars/${req.file.filename}`
    player.avatar = avatarUrl
    player.updatedAt = new Date().toISOString()
    await player.save()

    // 删除旧头像（Cloudinary 上删除旧文件）
    if (oldAvatar) {
      if (useCloudinary && oldAvatar.includes('cloudinary')) {
        const publicId = oldAvatar.split('/').pop()?.split('.')[0]
        if (publicId) {
          cloudinary.uploader.destroy(`luck-stage/lvavatars/${publicId}`, () => {})
        }
      } else if (oldAvatar.startsWith('/uploads/lvavatars/')) {
        const oldPath = path.join(__dirname, '..', '..', '..', '..', oldAvatar)
        if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {})
      }
    }

    res.json({ success: true, data: { avatar: avatarUrl, playerId: player.id } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '上传头像失败', code: 'SERVER_ERROR' })
  }
})

// DELETE /me/avatar - 选手自行删除头像（必须在 /:id/avatar 之前）
router.delete('/me/avatar', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    let player = await LVPlayer.findOne({ id: decoded.userId })
    // 降级查找：如果 token 中的 userId 找不到，尝试用请求体中的 playerId 查找
    if (!player && req.body.playerId) {
      player = await LVPlayer.findOne({ id: req.body.playerId })
    }
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })

    const oldAvatar = player.avatar
    player.avatar = null
    player.updatedAt = new Date().toISOString()
    await player.save()

    if (oldAvatar && oldAvatar.startsWith('/uploads/lvavatars/')) {
      const oldPath = path.join(__dirname, '..', '..', '..', '..', oldAvatar)
      if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {})
    }
    res.json({ success: true, data: null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '删除头像失败', code: 'SERVER_ERROR' })
  }
})

// POST /:id/avatar - 管理员上传选手头像
router.post('/:id/avatar', upload.single('avatar'), async (req, res) => {
  try {
    const player = await LVPlayer.findOne({ id: req.params.id, gameId: 'lovevariety' })
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })
    if (!req.file) return res.status(400).json({ success: false, error: '未上传图片文件', code: 'MISSING_FILE' })

    const oldAvatar = player.avatar
    // Cloudinary 返回完整 URL，本地返回相对路径
    const avatarUrl = useCloudinary ? req.file.path : `/uploads/lvavatars/${req.file.filename}`
    player.avatar = avatarUrl
    player.updatedAt = new Date().toISOString()
    await player.save()

    // 删除旧头像（Cloudinary 上删除旧文件）
    if (oldAvatar) {
      if (useCloudinary && oldAvatar.includes('cloudinary')) {
        const publicId = oldAvatar.split('/').pop()?.split('.')[0]
        if (publicId) {
          cloudinary.uploader.destroy(`luck-stage/lvavatars/${publicId}`, () => {})
        }
      } else if (oldAvatar.startsWith('/uploads/lvavatars/')) {
        const oldPath = path.join(__dirname, '..', '..', '..', '..', oldAvatar)
        if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {})
      }
    }

    res.json({ success: true, data: { avatar: avatarUrl, playerId: player.id } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '上传头像失败', code: 'SERVER_ERROR' })
  }
})

// DELETE /:id/avatar - 管理员删除选手头像
router.delete('/:id/avatar', async (req, res) => {
  try {
    const player = await LVPlayer.findOne({ id: req.params.id, gameId: 'lovevariety' })
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })
    const oldAvatar = player.avatar
    player.avatar = null
    player.updatedAt = new Date().toISOString()
    await player.save()

    if (oldAvatar && oldAvatar.startsWith('/uploads/lvavatars/')) {
      const oldPath = path.join(__dirname, '..', '..', '..', '..', oldAvatar)
      if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {})
    }
    res.json({ success: true, data: null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '删除头像失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
