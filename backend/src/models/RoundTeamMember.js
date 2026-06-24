const BaseModel = require('./BaseModel')

/**
 * 轮次队伍成员关系表（核心：Player × Round 关系）
 * 字段: id / roundId / roundIndex / teamId / playerId / createdAt
 * 
 * 关键用法:
 *   - 同一 player 在同一 round 只能属于一个 team
 *   - 历史回看通过 roundId 分区
 */
class RoundTeamMember extends BaseModel {
  constructor(data) {
    super('RoundTeamMember')
    this.roundId = null
    this.roundIndex = null
    this.teamId = null
    this.playerId = null
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

  static findOne(query) { return new RoundTeamMember().findOne(query) }
  static find(query = {}) { return new RoundTeamMember().find(query) }
  static deleteMany(query = {}) { return new RoundTeamMember().deleteMany(query) }
  static deleteOne(query = {}) { return new RoundTeamMember().deleteOne(query) }
  static countDocuments(query = {}) { return new RoundTeamMember().countDocuments(query) }
  static insertMany(items) {
    const model = new RoundTeamMember()
    return model.insertMany(items.map(i => new RoundTeamMember(i)))
  }
}

module.exports = RoundTeamMember
