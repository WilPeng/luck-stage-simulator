const BaseModel = require('../../../models/BaseModel')

class LVLoveVote extends BaseModel {
  constructor(data) {
    super('LVLoveVote')
    this.id = data?.id || null
    this.roundId = data?.roundId || ''
    this.voterId = data?.voterId || ''
    this.voterName = data?.voterName || ''
    this.targetId = data?.targetId || ''
    this.targetName = data?.targetName || ''
    this.value = data?.value ?? 0
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

  static findOne(query) { return new LVLoveVote().findOne(query) }
  static find(query = {}) { return new LVLoveVote().find(query) }
  static deleteMany(query = {}) { return new LVLoveVote().deleteMany(query) }
  static countDocuments(query = {}) { return new LVLoveVote().countDocuments(query) }
}

module.exports = LVLoveVote
