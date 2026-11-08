const BaseModel = require('../../../models/BaseModel')

/**
 * 睡眠时间段记录
 * 用于判断某条聊天消息发出时玩家是否正在睡觉。
 * from/to 都以实际点击“醒来”的时刻为准，而不是计划结束时间。
 */
class BBSleepRecord extends BaseModel {
  constructor(data) {
    super('BBSleepRecord')
    data = data || {}
    this.id = data.id || crypto.randomUUID()
    this.gameId = data.gameId || 'bigbrother'
    this.playerId = data.playerId || ''
    this.from = data.from || new Date().toISOString()
    this.to = data.to || null
    this.createdAt = data.createdAt || this.from
    this.updatedAt = data.updatedAt || this.from
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query = {}) { return new BBSleepRecord().findOne(query) }
  static find(query = {}) { return new BBSleepRecord().find(query) }
  static deleteMany(query = {}) { return new BBSleepRecord().deleteMany(query) }
}

module.exports = BBSleepRecord
