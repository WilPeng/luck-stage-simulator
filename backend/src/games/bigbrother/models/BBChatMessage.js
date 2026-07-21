const BaseModel = require('../../../models/BaseModel')

class BBChatMessage extends BaseModel {
  constructor(data) {
    super('BBChatMessage')
    this.id = data?.id || null
    this.senderId = data?.senderId || ''
    this.senderName = data?.senderName || ''
    this.senderRole = data?.senderRole || 'houseguest'
    this.senderAvatar = data?.senderAvatar || null
    this.content = data?.content || ''
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

  static findOne(query) { return new BBChatMessage().findOne(query) }
  static find(query = {}) { return new BBChatMessage().find(query) }
  static deleteMany(query = {}) { return new BBChatMessage().deleteMany(query) }
  static countDocuments(query = {}) { return new BBChatMessage().countDocuments(query) }
  static insertMany(items) { return new BBChatMessage().insertMany(items.map(i => new BBChatMessage(i))) }
}

module.exports = BBChatMessage
