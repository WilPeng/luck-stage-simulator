const BaseModel = require('../../../models/BaseModel')

class BBSeason extends BaseModel {
  constructor(data) {
    super('BBSeason')
    this.id = data?.id || null
    this.name = data?.name || 'Big Brother'
    this.gameId = data?.gameId || 'bigbrother'
    this.currentRound = data?.currentRound ?? 1
    this.currentStage = data?.currentStage || 'hoh_competition'
    this.totalRounds = data?.totalRounds ?? 10
    this.status = data?.status || 'running' // running | finished
    this.houseguestsCount = data?.houseguestsCount ?? 0
    // twist 配置: [{ round: 1, twists: ['no_pendant_challenge', 'secret_keeper'] }, ...]
    this.twistConfigs = data?.twistConfigs || []
    // 轮次配置（替代 twistConfigs）: [{ round: 1, twists: [], eliminationRank: 16, isJury: false }, ...]
    this.roundConfigs = data?.roundConfigs || []
    // 因果报应标记: 下轮自动 HOH 的玩家 ID（在淘汰结果阶段设置，下轮 HOH 竞争阶段读取并清除）
    this.nextHohPlayerId = data?.nextHohPlayerId || null
    this.nextHohPlayerName = data?.nextHohPlayerName || ''
    // Jury 人数（赛季开始前设置）
    this.jurySize = data?.jurySize ?? 7
    // Final 人数（赛季开始前设置，最终不淘汰进入决赛的人数）
    this.finalSize = data?.finalSize ?? 2
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

  static findOne(query) { return new BBSeason().findOne(query) }
  static find(query = {}) { return new BBSeason().find(query) }
  static deleteMany(query = {}) { return new BBSeason().deleteMany(query) }
  static countDocuments(query = {}) { return new BBSeason().countDocuments(query) }
}

module.exports = BBSeason
