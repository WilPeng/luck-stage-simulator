const BaseModel = require('./BaseModel')

/**
 * 大众评审对舞台（团队）的 yes/no 投票
 * 字段: id / roundId / audienceId / seatNumber / teamId / teamName / votedYes / createdAt
 * - votedYes: true 表示该评审给这个舞台投了 yes
 */
class AudienceTeamVote extends BaseModel {
  constructor(data) {
    super('AudienceTeamVote')
    this.roundId = null
    this.audienceId = null
    this.seatNumber = null
    this.teamId = null
    this.teamName = ''
    this.votedYes = false
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

  static findOne(query) { return new AudienceTeamVote().findOne(query) }
  static find(query = {}) { return new AudienceTeamVote().find(query) }
  static deleteMany(query = {}) { return new AudienceTeamVote().deleteMany(query) }
  static deleteOne(query = {}) { return new AudienceTeamVote().deleteOne(query) }
  static countDocuments(query = {}) { return new AudienceTeamVote().countDocuments(query) }
  static insertMany(items) {
    const model = new AudienceTeamVote()
    return model.insertMany(items.map(i => new AudienceTeamVote(i)))
  }
}

module.exports = AudienceTeamVote
