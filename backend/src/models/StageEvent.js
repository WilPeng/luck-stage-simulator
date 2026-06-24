const BaseModel = require('./BaseModel')

/**
 * 舞台事件（结算时随机抽取）
 * 字段: id / name / voteEffect / description / enabled / createdAt
 */
class StageEvent extends BaseModel {
  constructor(data) {
    super('StageEvent')
    this.name = ''
    this.voteEffect = 0      // 正数为加分，负数为扣分
    this.description = ''
    this.enabled = true
    this.createdAt = new Date().toISOString()
    if (data) Object.assign(this, data)
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new StageEvent().findOne(query) }
  static find(query = {}) { return new StageEvent().find(query) }
  static deleteMany(query = {}) { return new StageEvent().deleteMany(query) }
  static countDocuments(query = {}) { return new StageEvent().countDocuments(query) }
  static insertMany(items) {
    const model = new StageEvent()
    return model.insertMany(items.map(i => new StageEvent(i)))
  }
}

module.exports = StageEvent