const BaseModel = require('./BaseModel')

/**
 * 大众评审成员（每轮 1000 人）
 * 字段: id / roundId / seatNumber / gender / age / occupation / createdAt
 */
class AudienceMember extends BaseModel {
  constructor(data) {
    super('AudienceMember')
    this.roundId = null
    this.seatNumber = null
    this.gender = null    // 男 / 女
    this.age = null       // 18-60
    this.occupation = null // 职业
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

  static findOne(query) { return new AudienceMember().findOne(query) }
  static find(query = {}) { return new AudienceMember().find(query) }
  static deleteMany(query = {}) { return new AudienceMember().deleteMany(query) }
  static deleteOne(query = {}) { return new AudienceMember().deleteOne(query) }
  static countDocuments(query = {}) { return new AudienceMember().countDocuments(query) }
  static insertMany(items) {
    const model = new AudienceMember()
    return model.insertMany(items.map(i => new AudienceMember(i)))
  }
}

module.exports = AudienceMember
