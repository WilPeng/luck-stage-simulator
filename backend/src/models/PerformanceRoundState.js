const BaseModel = require('./BaseModel')

/**
 * 公演轮次状态（持久化公演开启、已揭晓队伍等状态）
 * 字段: id / roundId / roundIndex / started / revealedTeamIds / updatedAt
 */
class PerformanceRoundState extends BaseModel {
  constructor(data) {
    super('PerformanceRoundState')
    this.roundId = null             // 前端 roundId 格式 "round-1"
    this.roundIndex = null          // 轮次数字
    this.started = false            // 公演是否已开启
    this.revealedTeamIds = []       // 已揭晓的队伍 ID 列表
    this.updatedAt = null
    if (data) Object.assign(this, data)
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new PerformanceRoundState().findOne(query) }
  static find(query = {}) { return new PerformanceRoundState().find(query) }
  static deleteMany(query = {}) { return new PerformanceRoundState().deleteMany(query) }
  static deleteOne(query = {}) { return new PerformanceRoundState().deleteOne(query) }
  static countDocuments(query = {}) { return new PerformanceRoundState().countDocuments(query) }
}

module.exports = PerformanceRoundState
