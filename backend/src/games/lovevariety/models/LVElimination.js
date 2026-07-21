const BaseModel = require('../../../models/BaseModel')

class LVElimination extends BaseModel {
  constructor(data) {
    super('LVElimination')
    this.id = data?.id || null
    this.roundId = data?.roundId || ''
    this.eliminatedId = data?.eliminatedId || ''
    this.eliminatedName = data?.eliminatedName || ''
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

  static findOne(query) { return new LVElimination().findOne(query) }
  static find(query = {}) { return new LVElimination().find(query) }
  static deleteMany(query = {}) { return new LVElimination().deleteMany(query) }
  static countDocuments(query = {}) { return new LVElimination().countDocuments(query) }
}

module.exports = LVElimination
