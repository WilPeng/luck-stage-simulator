const BaseModel = require('../../../models/BaseModel')

class BBVetoRecord extends BaseModel {
  constructor(data) {
    super('BBVetoRecord')
    this.id = data?.id || null
    this.roundId = data?.roundId || null
    this.competitionName = data?.competitionName || '否决权竞争'
    this.participants = data?.participants || [] // [{ playerId, playerName, rank }]
    this.winnerId = data?.winnerId || null
    this.winnerName = data?.winnerName || ''
    this.used = data?.used || false // 是否使用了否决权
    this.usedOnPlayerId = data?.usedOnPlayerId || null // 被拯救的提名者
    this.usedOnPlayerName = data?.usedOnPlayerName || ''
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

  static findOne(query) { return new BBVetoRecord().findOne(query) }
  static find(query = {}) { return new BBVetoRecord().find(query) }
  static deleteMany(query = {}) { return new BBVetoRecord().deleteMany(query) }
  static countDocuments(query = {}) { return new BBVetoRecord().countDocuments(query) }
  static insertMany(items) { return new BBVetoRecord().insertMany(items.map(i => new BBVetoRecord(i))) }
}

module.exports = BBVetoRecord
