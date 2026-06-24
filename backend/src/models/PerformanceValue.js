const BaseModel = require('./BaseModel')

/**
 * 选手公演发挥值（在公演结算前生成，按轮次隔离）
 * 字段: id / roundId / roundIndex / playerId / teamId / performanceValue / generatedAt
 */
class PerformanceValue extends BaseModel {
  constructor(data) {
    super('PerformanceValue')
    this.roundId = null
    this.roundIndex = null
    this.playerId = null
    this.teamId = null
    this.performanceValue = null     // 随机发挥值 (-5 ~ 15)
    this.generatedAt = null
    if (data) Object.assign(this, data)
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new PerformanceValue().findOne(query) }
  static find(query = {}) { return new PerformanceValue().find(query) }
  static deleteMany(query = {}) { return new PerformanceValue().deleteMany(query) }
  static countDocuments(query = {}) { return new PerformanceValue().countDocuments(query) }
}

module.exports = PerformanceValue
