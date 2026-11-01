/**
 * 游戏库 REST 路由
 * 管理员维护游戏展示顺序与文件夹（每个游戏可属于多个文件夹）
 */
const express = require('express')
const router = express.Router()
const BBGameLibrary = require('../models/BBGameLibrary')

const LIBRARY_ID = BBGameLibrary.LIBRARY_ID

async function loadLibrary() {
  const existing = await BBGameLibrary.findOne({ id: LIBRARY_ID })
  return existing || new BBGameLibrary({ id: LIBRARY_ID })
}

function normalizeKeys(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  for (const v of list) {
    const key = String(v == null ? '' : v).trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

function findFolder(library, folderId) {
  return (library.folders || []).find(f => f.id === folderId)
}

// GET / - 获取游戏库配置
router.get('/', async (req, res) => {
  try {
    const library = await loadLibrary()
    res.json({ success: true, data: library.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取游戏库失败' })
  }
})

// PUT /order - 保存游戏展示顺序
router.put('/order', async (req, res) => {
  try {
    const { order } = req.body
    if (!Array.isArray(order)) {
      return res.status(400).json({ success: false, error: '排序数据无效' })
    }
    const library = await loadLibrary()
    library.order = normalizeKeys(order)
    library.updatedAt = new Date().toISOString()
    await library.save()
    res.json({ success: true, data: { order: library.order } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '保存排序失败' })
  }
})

// POST /folders - 新建文件夹
router.post('/folders', async (req, res) => {
  try {
    const name = String(req.body && req.body.name ? req.body.name : '').trim()
    if (!name) {
      return res.status(400).json({ success: false, error: '文件夹名称不能为空' })
    }
    const library = await loadLibrary()
    const folder = {
      id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      games: [],
      createdAt: new Date().toISOString()
    }
    library.folders.push(folder)
    library.updatedAt = new Date().toISOString()
    await library.save()
    res.json({ success: true, data: folder })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '创建文件夹失败' })
  }
})

// PUT /folders/:folderId - 重命名文件夹或设置其游戏列表
router.put('/folders/:folderId', async (req, res) => {
  try {
    const library = await loadLibrary()
    const folder = findFolder(library, req.params.folderId)
    if (!folder) {
      return res.status(404).json({ success: false, error: '文件夹不存在' })
    }
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim()
      if (!name) {
        return res.status(400).json({ success: false, error: '文件夹名称不能为空' })
      }
      folder.name = name
    }
    if (req.body.games !== undefined) {
      folder.games = normalizeKeys(req.body.games)
    }
    library.updatedAt = new Date().toISOString()
    await library.save()
    res.json({ success: true, data: folder })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '更新文件夹失败' })
  }
})

// POST /folders/:folderId/toggle - 将游戏加入/移出文件夹
router.post('/folders/:folderId/toggle', async (req, res) => {
  try {
    const gameKey = String(req.body && req.body.gameKey ? req.body.gameKey : '').trim()
    if (!gameKey) {
      return res.status(400).json({ success: false, error: '缺少游戏标识' })
    }
    const library = await loadLibrary()
    const folder = findFolder(library, req.params.folderId)
    if (!folder) {
      return res.status(404).json({ success: false, error: '文件夹不存在' })
    }
    const idx = folder.games.indexOf(gameKey)
    if (idx >= 0) folder.games.splice(idx, 1)
    else folder.games.push(gameKey)
    library.updatedAt = new Date().toISOString()
    await library.save()
    res.json({ success: true, data: folder })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '更新文件夹失败' })
  }
})

// DELETE /folders/:folderId - 删除文件夹
router.delete('/folders/:folderId', async (req, res) => {
  try {
    const library = await loadLibrary()
    const idx = (library.folders || []).findIndex(f => f.id === req.params.folderId)
    if (idx < 0) {
      return res.status(404).json({ success: false, error: '文件夹不存在' })
    }
    library.folders.splice(idx, 1)
    library.updatedAt = new Date().toISOString()
    await library.save()
    res.json({ success: true, message: '已删除' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '删除文件夹失败' })
  }
})

module.exports = router
