const BaseModel = require('./BaseModel')

/**
 * 队伍模型（每轮独立组队）
 * 字段: id / roundId / roundIndex / name / index / maxMembers / captainId / memberIds[] / locked / songId / createdAt / updatedAt
 */
class Team extends BaseModel {
  constructor(data) {
    super('Team')
    this.roundId = null
    this.roundIndex = null
    this.maxMembers = 5
    this.locked = false
    this.memberIds = []
    this.captainId = null
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
    const model = new Team()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new Team()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new Team()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new Team()
    return model.countDocuments(query)
  }

  static insertMany(items) {
    const model = new Team()
    return model.insertMany(items.map(i => new Team(i)))
  }
}

module.exports = Team
