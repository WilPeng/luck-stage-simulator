const BaseModel = require('../../../models/BaseModel')
const { getCollection } = require('../../../config/db')

class BBHouseguest extends BaseModel {
  constructor(data) {
    super('BBHouseguest')
    this.id = data?.id || null
    this.name = data?.name || ''
    this.loginCode = data?.loginCode || ''
    this.password = data?.password || ''
    this.role = data?.role || 'houseguest' // admin | houseguest
    this.status = data?.status || 'active' // active | evicted | jury
    this.hasLogin = data?.hasLogin || false
    this.avatar = data?.avatar || null
    this.currentRoomId = data?.currentRoomId || 'living_room'
    this.isHaveNot = data?.isHaveNot || false
    // 睡眠状态
    this.isSleeping = data?.isSleeping || false
    this.sleepStartedAt = data?.sleepStartedAt || null
    this.wakeAt = data?.wakeAt || null                 // 可醒来时间（现实 6 小时后）
    this.lastSleepDate = data?.lastSleepDate || null   // YYYY-MM-DD（本地日期）
    this.hohSleepApproved = data?.hohSleepApproved || false // 是否获准在 HOH 房睡觉
    // 洗澡状态
    this.isShowering = data?.isShowering || false
    this.showerStartedAt = data?.showerStartedAt || null
    this.lastShowerDate = data?.lastShowerDate || null
    this.gameId = data?.gameId || 'bigbrother'
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

  static findOne(query) { return new BBHouseguest().findOne(query) }
  static find(query = {}) { return new BBHouseguest().find(query) }
  static deleteOne(query = {}) { return new BBHouseguest().deleteOne(query) }
  static deleteMany(query = {}) { return new BBHouseguest().deleteMany(query) }
  static countDocuments(query = {}) { return new BBHouseguest().countDocuments(query) }
  static insertMany(items) { return new BBHouseguest().insertMany(items.map(i => new BBHouseguest(i))) }

  static async search(query = {}) {
    const { keyword, status, page = 1, pageSize = 20, gameId } = query
    const filter = { gameId: gameId || 'bigbrother' }
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
      new BBHouseguest()._getCollection().find(filter).skip(skip).limit(currentPageSize).toArray(),
      new BBHouseguest()._getCollection().countDocuments(filter)
    ])
    return {
      list: documents.map(d => new BBHouseguest(d)),
      total,
      page: currentPage,
      pageSize: currentPageSize,
      totalPages: Math.ceil(total / currentPageSize)
    }
  }

  static async stats(gameId) {
    const gid = gameId || 'bigbrother'
    const [total, active, evicted, jury] = await Promise.all([
      BBHouseguest.countDocuments({ gameId: gid }),
      BBHouseguest.countDocuments({ gameId: gid, status: 'active' }),
      BBHouseguest.countDocuments({ gameId: gid, status: 'evicted' }),
      BBHouseguest.countDocuments({ gameId: gid, status: 'jury' })
    ])
    return { total, active, evicted, jury }
  }
}

module.exports = BBHouseguest
