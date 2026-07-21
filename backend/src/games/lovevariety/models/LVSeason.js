const BaseModel = require('../../../models/BaseModel')

class LVSeason extends BaseModel {
  constructor(data) {
    super('LVSeason')
    this.id = data?.id || null
    this.name = data?.name || '恋综'
    this.gameId = data?.gameId || 'lovevariety'
    this.currentRound = data?.currentRound ?? 1
    this.currentStage = data?.currentStage || 'love_vote'
    this.totalRounds = data?.totalRounds ?? 10
    this.status = data?.status || 'running'
    this.playerCount = data?.playerCount ?? 0
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

  static findOne(query) { return new LVSeason().findOne(query) }
  static find(query = {}) { return new LVSeason().find(query) }
  static deleteMany(query = {}) { return new LVSeason().deleteMany(query) }
  static countDocuments(query = {}) { return new LVSeason().countDocuments(query) }
}

module.exports = LVSeason
