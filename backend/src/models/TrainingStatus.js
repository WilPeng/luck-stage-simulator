const BaseModel = require('./BaseModel')

/**
 * 选手本轮训练结束状态
 * 字段: id / roundId / roundIndex / playerId / finished / finishedAt
 */
class TrainingStatus extends BaseModel {
  constructor(data) {
    super('TrainingStatus')
    if (data) {
      this.id = data.id || null
      this.roundId = data.roundId || null
      this.roundIndex = data.roundIndex ?? null
      this.playerId = data.playerId || null
      this.finished = !!data.finished
      this.finishedAt = data.finishedAt || null
      this.createdAt = data.createdAt || new Date().toISOString()
      this.updatedAt = data.updatedAt || new Date().toISOString()
    }
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() {
    return super.save(this)
  }

  static findOne(query) {
    return new TrainingStatus().findOne(query)
  }

  static find(query = {}) {
    return new TrainingStatus().find(query)
  }

  static deleteMany(query = {}) {
    return new TrainingStatus().deleteMany(query)
  }
}

module.exports = TrainingStatus
