const BaseModel = require('../../../models/BaseModel')

class BBLocationHistory extends BaseModel {
  constructor(data) {
    super('BBLocationHistory')
    this.id = data?.id || null
    this.playerId = data?.playerId || ''
    this.playerName = data?.playerName || ''
    this.roomId = data?.roomId || ''
    this.from = data?.from || new Date().toISOString()  // 进入时间
    this.to = data?.to || null                          // 离开时间（null = 当前所在）
    this.gameId = data?.gameId || 'bigbrother'
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new BBLocationHistory().findOne(query) }
  static find(query = {}) { return new BBLocationHistory().find(query) }
  static deleteOne(query) { return new BBLocationHistory().deleteOne(query) }
  static deleteMany(query = {}) { return new BBLocationHistory().deleteMany(query) }
  static countDocuments(query = {}) { return new BBLocationHistory().countDocuments(query) }
  static insertOne(data) { return new BBLocationHistory(data).save() }
}

module.exports = BBLocationHistory
