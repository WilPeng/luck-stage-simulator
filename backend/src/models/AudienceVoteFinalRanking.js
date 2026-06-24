const BaseModel = require('./BaseModel')

/**
 * 大众评审最终排名（管理员释放后保存）
 * 字段: id / roundId / roundIndex / rankings[] / releasedAt / createdAt
 * rankings[i]: playerId, playerName, teamId, teamName, votes, rank, totalWeight
 */
class AudienceVoteFinalRanking extends BaseModel {
  constructor(data) {
    super('AudienceVoteFinalRanking')
    this.roundId = null
    this.roundIndex = null
    this.rankings = []             // 最终排名列表
    this.releasedAt = null
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

  static findOne(query) { return new AudienceVoteFinalRanking().findOne(query) }
  static find(query = {}) { return new AudienceVoteFinalRanking().find(query) }
  static deleteMany(query = {}) { return new AudienceVoteFinalRanking().deleteMany(query) }
  static deleteOne(query = {}) { return new AudienceVoteFinalRanking().deleteOne(query) }
  static countDocuments(query = {}) { return new AudienceVoteFinalRanking().countDocuments(query) }
}

module.exports = AudienceVoteFinalRanking
