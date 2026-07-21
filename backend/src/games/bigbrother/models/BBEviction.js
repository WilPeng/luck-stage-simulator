const BaseModel = require('../../../models/BaseModel')

class BBEviction extends BaseModel {
  constructor(data) {
    super('BBEviction')
    this.id = data?.id || null
    this.roundId = data?.roundId || null
    this.evictedId = data?.evictedId || null
    this.evictedName = data?.evictedName || ''
    this.voteCount = data?.voteCount || 0
    this.totalVotes = data?.totalVotes || 0
    this.voteResults = data?.voteResults || [] // [{ playerId, playerName, votes }]
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

  static findOne(query) { return new BBEviction().findOne(query) }
  static find(query = {}) { return new BBEviction().find(query) }
  static deleteMany(query = {}) { return new BBEviction().deleteMany(query) }
  static countDocuments(query = {}) { return new BBEviction().countDocuments(query) }
  static insertMany(items) { return new BBEviction().insertMany(items.map(i => new BBEviction(i))) }
}

module.exports = BBEviction
