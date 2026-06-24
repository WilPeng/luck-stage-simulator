const BaseModel = require('./BaseModel')

/**
 * 选手得分（每轮独立）
 * 字段: id / userId / userName / teamId / teamName / roundId / roundIndex / vocalScore / danceScore / charmScore / randomScore / teamBonus / finalScore / rank / createdAt / updatedAt
 */
class PlayerScore extends BaseModel {
  constructor(data) {
    super('PlayerScore')
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
    const model = new PlayerScore()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new PlayerScore()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new PlayerScore()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new PlayerScore()
    return model.countDocuments(query)
  }

  static insertMany(items) {
    const model = new PlayerScore()
    return model.insertMany(items.map(i => new PlayerScore(i)))
  }
}

module.exports = PlayerScore
