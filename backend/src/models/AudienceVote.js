const BaseModel = require('./BaseModel')

/**
 * 大众评审投票明细（每轮 3000 张票）
 * 字段: id / roundId / audienceId / seatNumber / voteOrder / playerId / createdAt
 */
class AudienceVote extends BaseModel {
  constructor(data) {
    super('AudienceVote')
    this.roundId = null
    this.audienceId = null
    this.seatNumber = null
    this.voteOrder = null
    this.playerId = null
    this.createdAt = new Date().toISOString()
    if (data) Object.assign(this, data)
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new AudienceVote().findOne(query) }
  static find(query = {}) { return new AudienceVote().find(query) }
  static deleteMany(query = {}) { return new AudienceVote().deleteMany(query) }
  static deleteOne(query = {}) { return new AudienceVote().deleteOne(query) }
  static countDocuments(query = {}) { return new AudienceVote().countDocuments(query) }
  static insertMany(items) {
    const model = new AudienceVote()
    return model.insertMany(items.map(i => new AudienceVote(i)))
  }
}

module.exports = AudienceVote
