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
    // 聊天类型: 'public' (群聊) | 'private' (私聊) | 'room' (房间)
    this.chatType = data?.chatType || 'public'
    // 房间聊天时的房间 ID
    this.roomId = data?.roomId || null
    // 私聊目标ID（仅私聊时有值）
    this.targetId = data?.targetId || null
    this.targetName = data?.targetName || null
    this.gameId = data?.gameId || 'bigbrother'
    // 发送时快照：当时能看到这条消息的玩家 ID（睡眠中/不在房间的玩家会被排除）
    // null 表示旧消息没有快照，需要按位置历史兜底计算
    this.visibleTo = Array.isArray(data?.visibleTo) ? data.visibleTo.map(String) : null
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
