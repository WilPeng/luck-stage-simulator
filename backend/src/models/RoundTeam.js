const BaseModel = require('./BaseModel')

/**
 * 轮次队伍（每轮独立组队）
 * 字段: id / roundId / roundIndex / name / index / captainId / maxMembers / createdAt
 */
class RoundTeam extends BaseModel {
  constructor(data) {
    super('RoundTeam')
    this.roundId = null
    this.roundIndex = null
    this.maxMembers = 5
    this.captainId = null
    this.locked = false
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

  static findOne(query) { return new RoundTeam().findOne(query) }
  static find(query = {}) { return new RoundTeam().find(query) }
  static deleteMany(query = {}) { return new RoundTeam().deleteMany(query) }
  static deleteOne(query = {}) { return new RoundTeam().deleteOne(query) }
  static countDocuments(query = {}) { return new RoundTeam().countDocuments(query) }
  static insertMany(items) {
    const model = new RoundTeam()
    return model.insertMany(items.map(i => new RoundTeam(i)))
  }
}

module.exports = RoundTeam
