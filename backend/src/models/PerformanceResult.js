const BaseModel = require('./BaseModel')

/**
 * 公演结果（每轮独立，按团队计算）
 * 字段: id / teamId / teamName / songId / songName / roundId / roundIndex / attrScore / randomScore / rehearsalBonus / teamRankBonus / finalScore / rank / dangerTeam / createdAt / updatedAt
 */
class PerformanceResult extends BaseModel {
  constructor(data) {
    super('PerformanceResult')
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
    const model = new PerformanceResult()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new PerformanceResult()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new PerformanceResult()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new PerformanceResult()
    return model.countDocuments(query)
  }

  static insertMany(items) {
    const model = new PerformanceResult()
    return model.insertMany(items.map(i => new PerformanceResult(i)))
  }
}

module.exports = PerformanceResult
