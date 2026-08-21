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
    // 聊天类型: 'public' (群聊) | 'private' (私聊)
    this.chatType = data?.chatType || 'public'
    // 私聊目标ID（仅私聊时有值）
    this.targetId = data?.targetId || null
    this.targetName = data?.targetName || null
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
  static findPaginated(query, options) { return new BBChatMessage().findPaginated(query, options) }
  static deleteMany(query = {}) { return new BBChatMessage().deleteMany(query) }
  static countDocuments(query = {}) { return new BBChatMessage().countDocuments(query) }
  static insertMany(items) { return new BBChatMessage().insertMany(items.map(i => new BBChatMessage(i))) }
}

module.exports = BBChatMessage
