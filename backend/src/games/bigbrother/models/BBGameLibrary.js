const BaseModel = require('../../../models/BaseModel')

const LIBRARY_ID = 'bigbrother'

class BBGameLibrary extends BaseModel {
  constructor(data) {
    super('BBGameLibrary')
    data = data || {}
    this.id = data.id || LIBRARY_ID
    this.gameId = data.gameId || 'bigbrother'
    // 游戏展示顺序（内置游戏使用其 id，自定义游戏使用其原始 id）
    this.order = Array.isArray(data.order) ? data.order.map(String) : []
    // 文件夹：每个游戏可同时属于多个文件夹
    this.folders = (Array.isArray(data.folders) ? data.folders : []).map(f => ({
      id: f.id || crypto.randomUUID(),
      name: f.name || '',
      games: Array.isArray(f.games) ? f.games.map(String) : [],
      createdAt: f.createdAt || new Date().toISOString()
    }))
    this.createdAt = data.createdAt || new Date().toISOString()
    this.updatedAt = data.updatedAt || new Date().toISOString()
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new BBGameLibrary().findOne(query) }
  static find(query = {}) { return new BBGameLibrary().find(query) }
}

BBGameLibrary.LIBRARY_ID = LIBRARY_ID

module.exports = BBGameLibrary
