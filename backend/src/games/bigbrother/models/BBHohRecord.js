const BaseModel = require('../../../models/BaseModel')

class BBHohRecord extends BaseModel {
  constructor(data) {
    super('BBHohRecord')
    this.id = data?.id || null
    this.roundId = data?.roundId || null
    this.winnerId = data?.winnerId || null
    this.winnerName = data?.winnerName || ''
    this.competitionType = data?.competitionType || '' // endurance | luck | skill
    this.competitionName = data?.competitionName || ''
    this.participants = data?.participants || [] // [{ playerId, playerName, rank }]
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

  static findOne(query) { return new BBHohRecord().findOne(query) }
  static find(query = {}) { return new BBHohRecord().find(query) }
  static deleteMany(query = {}) { return new BBHohRecord().deleteMany(query) }
  static countDocuments(query = {}) { return new BBHohRecord().countDocuments(query) }
  static insertMany(items) { return new BBHohRecord().insertMany(items.map(i => new BBHohRecord(i))) }
}

module.exports = BBHohRecord
