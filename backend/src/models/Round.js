const BaseModel = require('./BaseModel')

/**
 * 轮次（核心：Season → Round1/Round2/Round3 ...）
 * 字段: id / seasonId / index / stage / createdAt / updatedAt
 * 预先准备配置: teamCount / teamSizes / songPoolIds / trainingTimesAllowed / eliminationCount / dangerLineRatio
 * stage: setup → preparation → captain → teaming → song → training → rehearsal → performance → elimination
 */
class Round extends BaseModel {
  constructor(data) {
    super('Round')
    this.seasonId = null
    this.index = null
    this.stage = 'preparation'
    this.gameId = null
    this.createdAt = new Date().toISOString()
    this.updatedAt = new Date().toISOString()
    this.teamCount = 5
    this.teamSizes = []
    this.songPoolIds = []
    this.trainingTimesAllowed = 5
    this.eliminationCount = 5
    this.dangerLineRatio = 0.2
    if (data) Object.assign(this, data)
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
    const model = new Round()
    return model.findOne(query)
  }

  static find(query = {}) {
    const model = new Round()
    return model.find(query)
  }

  static deleteMany(query = {}) {
    const model = new Round()
    return model.deleteMany(query)
  }

  static countDocuments(query = {}) {
    const model = new Round()
    return model.countDocuments(query)
  }

  static insertMany(items) {
    const model = new Round()
    return model.insertMany(items.map(i => new Round(i)))
  }
}

module.exports = Round
