const BaseModel = require('../../../models/BaseModel')

class BBJuryQA extends BaseModel {
  constructor(data) {
    super('BBJuryQA')
    data = data || {}
    this.id = data.id || null
    this.roundId = data.roundId || null
    this.juryId = data.juryId || null
    this.juryName = data.juryName || ''
    this.question = data.question || ''
    this.answer = data.answer || ''
    this.answerBy = data.answerBy || null      // 回答的决赛选手 id
    this.answerByName = data.answerByName || ''
    this.answeredAt = data.answeredAt || null

    // ===== 新版问答室消息字段 =====
    this.type = data.type || null              // message | question | answer
    this.phase = data.phase || null            // opening | qa | closing
    this.senderId = data.senderId || null
    this.senderName = data.senderName || ''
    this.senderRole = data.senderRole || ''    // finalist | jury | admin
    this.content = data.content || ''
    this.replyToId = data.replyToId || null
    this.replyToName = data.replyToName || ''
    this.replyToContent = data.replyToContent || ''

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

  static findOne(query) { return new BBJuryQA().findOne(query) }
  static find(query = {}) { return new BBJuryQA().find(query) }
  static deleteOne(query) { return new BBJuryQA().deleteOne(query) }
  static deleteMany(query) { return new BBJuryQA().deleteMany(query) }
  static countDocuments(query = {}) { return new BBJuryQA().countDocuments(query) }
}

module.exports = BBJuryQA
