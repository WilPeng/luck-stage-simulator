const BaseModel = require('../../../models/BaseModel')

class LVLetter extends BaseModel {
  constructor(data) {
    super('LVLetter')
    this.id = data?.id || null
    this.roundId = data?.roundId || ''
    this.senderId = data?.senderId || ''
    this.senderName = data?.senderName || ''
    this.receiverId = data?.receiverId || ''
    this.receiverName = data?.receiverName || ''
    this.content = data?.content || ''
    this.isAnonymous = data?.isAnonymous ?? false
    this.senderAvatar = data?.senderAvatar || null
    this.receiverAvatar = data?.receiverAvatar || null
    this.gameId = data?.gameId || 'lovevariety'
    this.createdAt = data?.createdAt || new Date().toISOString()
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new LVLetter().findOne(query) }
  static find(query = {}) { return new LVLetter().find(query) }
  static deleteOne(query = {}) { return new LVLetter().deleteOne(query) }
  static deleteMany(query = {}) { return new LVLetter().deleteMany(query) }
  static countDocuments(query = {}) { return new LVLetter().countDocuments(query) }
}

module.exports = LVLetter
