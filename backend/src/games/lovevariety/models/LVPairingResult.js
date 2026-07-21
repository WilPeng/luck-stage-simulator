const BaseModel = require('../../../models/BaseModel')

class LVPairingResult extends BaseModel {
  constructor(data) {
    super('LVPairingResult')
    this.id = data?.id || null
    this.roundId = data?.roundId || ''
    this.pairs = data?.pairs || []
    this.singlePlayerId = data?.singlePlayerId || null
    this.singlePlayerName = data?.singlePlayerName || ''
    this.gameId = data?.gameId || 'lovevariety'
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

  static findOne(query) { return new LVPairingResult().findOne(query) }
  static find(query = {}) { return new LVPairingResult().find(query) }
  static deleteMany(query = {}) { return new LVPairingResult().deleteMany(query) }
  static countDocuments(query = {}) { return new LVPairingResult().countDocuments(query) }
}

module.exports = LVPairingResult
