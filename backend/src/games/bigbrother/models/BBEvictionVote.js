const BaseModel = require('../../../models/BaseModel')

class BBEvictionVote extends BaseModel {
  constructor(data) {
    super('BBEvictionVote')
    this.id = data?.id || null
    this.roundId = data?.roundId || null
    this.voterId = data?.voterId || null
    this.voterName = data?.voterName || ''
    this.targetId = data?.targetId || null
    this.targetName = data?.targetName || ''
    this.gameId = data?.gameId || 'bigbrother'
    this.createdAt = data?.createdAt || new Date().toISOString()
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new BBEvictionVote().findOne(query) }
  static find(query = {}) { return new BBEvictionVote().find(query) }
  static deleteMany(query = {}) { return new BBEvictionVote().deleteMany(query) }
  static countDocuments(query = {}) { return new BBEvictionVote().countDocuments(query) }
  static insertMany(items) { return new BBEvictionVote().insertMany(items.map(i => new BBEvictionVote(i))) }
}

module.exports = BBEvictionVote
