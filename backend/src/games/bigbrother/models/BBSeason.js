const BaseModel = require('../../../models/BaseModel')

class BBSeason extends BaseModel {
  constructor(data) {
    super('BBSeason')
    this.id = data?.id || null
    this.name = data?.name || 'Big Brother'
    this.gameId = data?.gameId || 'bigbrother'
    this.currentRound = data?.currentRound ?? 1
    this.currentStage = data?.currentStage || 'hoh_competition'
    this.totalRounds = data?.totalRounds ?? 10
    this.status = data?.status || 'running' // running | finished
    this.houseguestsCount = data?.houseguestsCount ?? 0
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

  static findOne(query) { return new BBSeason().findOne(query) }
  static find(query = {}) { return new BBSeason().find(query) }
  static deleteMany(query = {}) { return new BBSeason().deleteMany(query) }
  static countDocuments(query = {}) { return new BBSeason().countDocuments(query) }
}

module.exports = BBSeason
