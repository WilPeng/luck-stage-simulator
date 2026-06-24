const BaseModel = require('./BaseModel')

/**
 * 队伍公演结果（每轮独立）
 * 字段: id / roundId / roundIndex / teamId / songId / teamName / songName
 *       票数拆解: baseVotes / attributeVotes / performanceVotes / compatibilityVotes / eventVotes / finalVotes
 *       歌曲权重: songVocalWeight / songDanceWeight / songCharmWeight
 *       队伍属性: avgVocal / avgDance / avgCharm
 *       适配度: compatibilityScore
 *       舞台事件: eventId / eventName / eventDescription
 *       rank / createdAt
 */
class TeamPerformance extends BaseModel {
  constructor(data) {
    super('TeamPerformance')
    this.roundId = null
    this.roundIndex = null
    this.teamId = null
    this.songId = null
    this.teamName = ''
    this.songName = ''
    // 旧字段（兼容）
    this.attrScore = 0
    this.randomScore = 0
    this.rehearsalBonus = 0
    this.teamRankBonus = 0
    this.finalScore = 0
    // 新字段 - 票数拆解
    this.baseVotes = 500
    this.attributeVotes = 0
    this.performanceVotes = 0
    this.compatibilityVotes = 0
    this.eventVotes = 0
    this.finalVotes = 0
    // 歌曲权重
    this.songVocalWeight = 3
    this.songDanceWeight = 3
    this.songCharmWeight = 3
    // 队伍平均属性
    this.avgVocal = 0
    this.avgDance = 0
    this.avgCharm = 0
    // 歌曲适配度
    this.compatibilityScore = 0
    // 舞台事件
    this.eventId = null
    this.eventName = ''
    this.eventDescription = ''
    // 成员实时发挥明细
    this.memberPerformances = []
    this.rank = null
    this.createdAt = new Date().toISOString()
    // 评级体系新增字段
    this.teamScore = 0             // 团队综合得分
    this.teamRating = ''            // 评级 S/A/B/C/D
    this.teamRatingText = ''        // 评级描述（完美舞台/出色表现/稳定发挥/略有不足/失误较多）
    if (data) Object.assign(this, data)
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new TeamPerformance().findOne(query) }
  static find(query = {}) { return new TeamPerformance().find(query) }
  static deleteMany(query = {}) { return new TeamPerformance().deleteMany(query) }
  static countDocuments(query = {}) { return new TeamPerformance().countDocuments(query) }
  static insertMany(items) {
    const model = new TeamPerformance()
    return model.insertMany(items.map(i => new TeamPerformance(i)))
  }
}

module.exports = TeamPerformance