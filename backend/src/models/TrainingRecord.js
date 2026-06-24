const BaseModel = require('./BaseModel')

/**
 * 训练记录（每轮独立）
 * 字段: id / userId / userName / roundId / roundIndex / cardId / cardName / cardType / effect / attributesAfter / createdAt / updatedAt
 */
class TrainingRecord extends BaseModel {
  constructor(data) {
    super('TrainingRecord')
    this.roundId = null
    this.roundIndex = null
    this.userId = null
    this.userName = null
    this.playerId = null
    this.cardId = null
    this.cardName = null
    this.cardType = null
    this.effect = null
    this.attrDelta = null
    this.attributesAfter = null
    this.createdAt = new Date().toISOString()
    this.updatedAt = new Date().toISOString()
    if (data) {
      Object.assign(this, data)
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
    const model = new TrainingRecord()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new TrainingRecord()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new TrainingRecord()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new TrainingRecord()
    return model.countDocuments(query)
  }

  static insertMany(items) {
    const model = new TrainingRecord()
    return model.insertMany(items.map(i => new TrainingRecord(i)))
  }
}

module.exports = TrainingRecord
