const BaseModel = require('./BaseModel')

/**
 * 彩排结果（每轮独立）
 * 字段: id / teamId / roundId / roundIndex / eventName / description / bonus / createdAt / updatedAt
 */
class RehearsalResult extends BaseModel {
  constructor(data) {
    super('RehearsalResult')
    this.roundId = null
    this.roundIndex = null
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
    const model = new RehearsalResult()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new RehearsalResult()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new RehearsalResult()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new RehearsalResult()
    return model.countDocuments(query)
  }

  static insertMany(items) {
    const model = new RehearsalResult()
    return model.insertMany(items.map(i => new RehearsalResult(i)))
  }
}

module.exports = RehearsalResult
