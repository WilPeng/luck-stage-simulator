const BaseModel = require('./BaseModel')

/**
 * 选手个人公演结果（每轮独立）
 * 字段: id / roundId / roundIndex / playerId / teamId / playerName / teamName
 *       / attrScore / randomScore / teamScoreShare / finalScore / rank
 *       / performanceValue / contribution / rankInTeam / createdAt
 */
class PlayerPerformance extends BaseModel {
  constructor(data) {
    super('PlayerPerformance')
    this.roundId = null
    this.roundIndex = null
    this.playerId = null
    this.teamId = null
    this.playerName = ''
    this.teamName = ''
    this.attrScore = 0
    this.randomScore = 0
    this.teamScoreShare = 0
    this.rehearsalBonus = 0
    this.finalScore = 0
    this.rank = null
    // 新字段
    this.performanceValue = 0       // 实时发挥值（可为负）
    this.contribution = 0           // 队内贡献百分比（0-100）
    this.rankInTeam = null          // 队内排名
    this.popularityWeight = 0       // 喜爱度权重（总权重）
    this.audienceAffinity = 0       // 观众缘随机值
    // 评级体系新增字段
    this.playerScore = 0            // 选手个人得分 0~120
    this.stageRating = ''           // 评级 S/A/B/C/D
    this.stageRatingText = ''       // 评级描述（完美舞台/出色表现/稳定发挥/略有不足/失误较多）
    // 权重细分字段
    this.baseContribution = 0       // 基础属性贡献分
    this.performanceContribution = 0 // 实时发挥贡献分
    this.teamRankBonus = 0          // 团队排名加成
    this.mvpBonus = 0               // 队内MVP加成
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

  static findOne(query) { return new PlayerPerformance().findOne(query) }
  static find(query = {}) { return new PlayerPerformance().find(query) }
  static deleteMany(query = {}) { return new PlayerPerformance().deleteMany(query) }
  static countDocuments(query = {}) { return new PlayerPerformance().countDocuments(query) }
  static insertMany(items) {
    const model = new PlayerPerformance()
    return model.insertMany(items.map(i => new PlayerPerformance(i)))
  }
}

module.exports = PlayerPerformance