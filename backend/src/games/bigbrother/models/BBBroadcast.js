const BaseModel = require('../../../models/BaseModel')

class BBBroadcast extends BaseModel {
  constructor(data) {
    super('BBBroadcast')
    data = data || {}
    this.id = data.id || null
    this.type = data.type || 'notice' // notice | invite
    this.roomId = data.roomId || null
    this.roomName = data.roomName || ''
    this.roomIcon = data.roomIcon || ''
    this.message = data.message || ''
    this.from = data.from || ''
    this.gameId = data.gameId || 'bigbrother'
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

  static findOne(query) { return new BBBroadcast().findOne(query) }
  static find(query = {}) { return new BBBroadcast().find(query) }
  static deleteOne(query) { return new BBBroadcast().deleteOne(query) }
  static deleteMany(query) { return new BBBroadcast().deleteMany(query) }
  static countDocuments(query = {}) { return new BBBroadcast().countDocuments(query) }
  static insertMany(items) { return new BBBroadcast().insertMany(items.map(i => new BBBroadcast(i))) }
}

module.exports = BBBroadcast
