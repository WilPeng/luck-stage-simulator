const BaseModel = require('./BaseModel')

/**
 * 聊天消息（预留按轮次分组）
 * 字段: id / senderId / senderName / senderRole / senderAvatar / roundId / content / createdAt / updatedAt
 */
class ChatMessage extends BaseModel {
  constructor(data) {
    super('ChatMessage')
    this.roundId = null
    this.gameId = null
    if (data) Object.assign(this, data)
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() {
    return super.save(this)
  }

  static findOne(query) {
    const model = new ChatMessage()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new ChatMessage()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new ChatMessage()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new ChatMessage()
    return model.countDocuments(query)
  }
}

module.exports = ChatMessage
