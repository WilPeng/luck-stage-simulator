const BaseModel = require('../../../models/BaseModel')

/**
 * 冠军投票（BB Finale）
 * 字段: id / gameId / voterId / voterName / targetId / targetName / createdAt
 */
class BBChampionVote extends BaseModel {
  constructor(data) {
    super('BBChampionVote')
    this.id = null
    this.gameId = 'bigbrother'
    this.voterId = null
    this.voterName = ''
    this.targetId = null
    this.targetName = ''
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

  static findOne(query) { return new BBChampionVote().findOne(query) }
  static find(query = {}) { return new BBChampionVote().find(query) }
  static deleteMany(query = {}) { return new BBChampionVote().deleteMany(query) }
  static countDocuments(query = {}) { return new BBChampionVote().countDocuments(query) }
}

module.exports = BBChampionVote
