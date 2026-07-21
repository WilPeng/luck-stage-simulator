const BaseModel = require('./BaseModel')

/**
 * 赛季（整个游戏只有一个赛季）
 * 核心状态字段：
 *   - currentRound: 当前第几公演（1 = 一公，2 = 二公，...）
 *   - currentStage: 当前阶段（PREPARATION | CAPTAIN_VOTE | TEAMING | SONG_SELECT | TRAINING | REHEARSAL | PERFORMANCE | ELIMINATION）
 *
 * 全部数据按 roundId 隔离，历史数据保留，不做"完成标记"。
 */
class Season extends BaseModel {
  constructor(data) {
    super('Season')
    this.id = data?.id || null
    this.name = data?.name || '乘风2026'
    this.gameId = data?.gameId || null
    this.currentRound = data?.currentRound ?? 1
    this.currentStage = data?.currentStage || 'preparation'
    this.totalRounds = data?.totalRounds ?? 3
    // 训练配置
    this.trainingDrawsPerPlayer = data?.trainingDrawsPerPlayer ?? 3
    // 公演评分配置
    this.baseScore = data?.baseScore ?? 100
    this.scoreMultiplier = data?.scoreMultiplier ?? 1
    this.randomMin = data?.randomMin ?? 0
    this.randomMax = data?.randomMax ?? 10
    this.teamRankBonusBase = data?.teamRankBonusBase ?? 0
    this.teamRankBonusMultiplier = data?.teamRankBonusMultiplier ?? 1
    this.teamRandomMin = data?.teamRandomMin ?? -5
    this.teamRandomMax = data?.teamRandomMax ?? 15
    // 聊天配置
    this.chatEnabled = data?.chatEnabled ?? true
    this.createdAt = data?.createdAt || new Date().toISOString()
    this.updatedAt = data?.updatedAt || new Date().toISOString()
  }

  toObject() {
    const obj = { ...this }
    delete obj._id
    delete obj.collectionName
    return obj
  }

  save() { return super.save(this) }

  static findOne(query) { return new Season().findOne(query) }
  static find(query = {}) { return new Season().find(query) }
  static deleteMany(query = {}) { return new Season().deleteMany(query) }
}

module.exports = Season
