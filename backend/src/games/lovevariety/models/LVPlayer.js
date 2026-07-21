const BaseModel = require('../../../models/BaseModel')
const { getCollection } = require('../../../config/db')

class LVPlayer extends BaseModel {
  constructor(data) {
    super('LVPlayer')
    this.id = data?.id || null
    this.name = data?.name || ''
    this.loginCode = data?.loginCode || ''
    this.password = data?.password || ''
    this.role = data?.role || 'player'
    this.status = data?.status || 'active'
    this.hasLogin = data?.hasLogin || false
    this.avatar = data?.avatar || null
    this.gameId = data?.gameId || 'lovevariety'
    this.createdAt = data?.createdAt || new Date().toISOString()
    this.updatedAt = data?.updatedAt || new Date().toISOString()
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new LVPlayer().findOne(query) }
  static find(query = {}) { return new LVPlayer().find(query) }
  static deleteOne(query = {}) { return new LVPlayer().deleteOne(query) }
  static deleteMany(query = {}) { return new LVPlayer().deleteMany(query) }
  static countDocuments(query = {}) { return new LVPlayer().countDocuments(query) }
  static insertMany(items) { return new LVPlayer().insertMany(items.map(i => new LVPlayer(i))) }

  static async search(query = {}) {
    const { keyword, status, page = 1, pageSize = 20, gameId } = query
    const filter = { gameId: gameId || 'lovevariety' }
    if (keyword) {
      filter.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { loginCode: { $regex: keyword, $options: 'i' } },
        { id: { $regex: keyword, $options: 'i' } }
      ]
    }
    if (status) filter.status = status
    const currentPage = Number(page) || 1
    const currentPageSize = Number(pageSize) || 20
    const skip = (currentPage - 1) * currentPageSize
    const [documents, total] = await Promise.all([
      new LVPlayer()._getCollection().find(filter).skip(skip).limit(currentPageSize).toArray(),
      new LVPlayer()._getCollection().countDocuments(filter)
    ])
    return {
      list: documents.map(d => new LVPlayer(d)),
      total,
      page: currentPage,
      pageSize: currentPageSize,
      totalPages: Math.ceil(total / currentPageSize)
    }
  }

  static async stats(gameId) {
    const gid = gameId || 'lovevariety'
    const [total, active, eliminated] = await Promise.all([
      LVPlayer.countDocuments({ gameId: gid }),
      LVPlayer.countDocuments({ gameId: gid, status: 'active' }),
      LVPlayer.countDocuments({ gameId: gid, status: 'eliminated' })
    ])
    return { total, active, eliminated }
  }
}

module.exports = LVPlayer
